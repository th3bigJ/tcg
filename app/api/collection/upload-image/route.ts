import { type NextRequest } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

function buildS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT ?? "",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: true,
    region: process.env.R2_REGION ?? "auto",
  });
}

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid form data" }, authCookieResponse, { status: 400 });
  }

  const entryId = typeof formData.get("entryId") === "string" ? (formData.get("entryId") as string).trim() : "";
  if (!entryId) {
    return jsonResponseWithAuthCookies({ error: "entryId is required" }, authCookieResponse, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return jsonResponseWithAuthCookies({ error: "file is required" }, authCookieResponse, { status: 400 });
  }

  // Verify this entry belongs to the customer
  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { data: row, error: fetchErr } = await supabase
    .from("customer_collections")
    .select("id, master_card_id")
    .eq("id", entryId)
    .eq("customer_id", customer.id)
    .single();

  if (fetchErr || !row) {
    return jsonResponseWithAuthCookies({ error: "Not found" }, authCookieResponse, { status: 404 });
  }

  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    return jsonResponseWithAuthCookies({ error: "Storage not configured" }, authCookieResponse, { status: 500 });
  }

  // Build a path: graded-images/{customerId}/{entryId}.{ext}
  const mimeType = file.type || "image/jpeg";
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const r2Key = `graded-images/${customer.id}/${entryId}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const body = Buffer.from(arrayBuffer);

  try {
    const s3 = buildS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        Body: body,
        ContentType: mimeType,
      }),
    );
  } catch (err) {
    console.error("[upload-image] R2 upload failed", err);
    return jsonResponseWithAuthCookies({ error: "Upload failed" }, authCookieResponse, { status: 500 });
  }

  // Update the graded_image column with the R2 key (relative path, resolved on read)
  const { error: updateErr } = await supabase
    .from("customer_collections")
    .update({ graded_image: r2Key })
    .eq("id", entryId)
    .eq("customer_id", customer.id);

  if (updateErr) {
    return jsonResponseWithAuthCookies({ error: updateErr.message }, authCookieResponse, { status: 422 });
  }

  return jsonResponseWithAuthCookies({ path: r2Key }, authCookieResponse);
}
