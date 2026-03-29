import type { SupabaseClient } from "@supabase/supabase-js";

import type { CustomerProfileShareRow, CustomerProfileShareStatus, CustomerPublic } from "@/lib/customerProfileShares";
import { normalizeShareEmail } from "@/lib/customerProfileShares";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function mapShareRow(row: Record<string, unknown>): CustomerProfileShareRow {
  return {
    id: String(row.id),
    ownerCustomerId: Number(row.owner_customer_id),
    recipientCustomerId:
      row.recipient_customer_id === null || row.recipient_customer_id === undefined
        ? null
        : Number(row.recipient_customer_id),
    recipientEmail: String(row.recipient_email ?? ""),
    status: row.status as CustomerProfileShareStatus,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  };
}

function mapCustomer(row: Record<string, unknown>): CustomerPublic {
  return {
    id: String(row.id),
    email: String(row.email ?? ""),
    firstName: String(row.first_name ?? ""),
    lastName: String(row.last_name ?? ""),
  };
}

async function fetchCustomerByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<CustomerPublic | null> {
  const normalized = normalizeShareEmail(email);
  const { data, error } = await supabase
    .from("customers")
    .select("id, email, first_name, last_name")
    .ilike("email", normalized)
    .maybeSingle();

  if (error || !data) return null;
  return mapCustomer(data as Record<string, unknown>);
}

/** Call after login so invites to this email become pending_accept. */
export async function linkPendingProfileSharesForCustomer(
  supabase: SupabaseClient,
  customerId: string,
  email: string,
): Promise<void> {
  const normalized = normalizeShareEmail(email);
  const cid = Number.parseInt(customerId, 10);
  if (!Number.isFinite(cid) || !normalized) return;

  await supabase
    .from("customer_profile_shares")
    .update({
      recipient_customer_id: cid,
      status: "pending_accept",
      updated_at: new Date().toISOString(),
    })
    .is("recipient_customer_id", null)
    .eq("status", "pending_recipient")
    .eq("recipient_email", normalized)
    .neq("owner_customer_id", cid);
}

export type OutgoingShareListItem = CustomerProfileShareRow & {
  recipient: CustomerPublic | null;
};

export type IncomingShareListItem = CustomerProfileShareRow & {
  owner: CustomerPublic;
};

export async function listOutgoingProfileShares(ownerCustomerId: string): Promise<OutgoingShareListItem[]> {
  const supabase = await createSupabaseServerClient();
  const oid = Number.parseInt(ownerCustomerId, 10);
  const { data, error } = await supabase
    .from("customer_profile_shares")
    .select("*")
    .eq("owner_customer_id", oid)
    .order("created_at", { ascending: false });

  if (error || !data?.length) return [];

  const rows = data as Record<string, unknown>[];
  const recipientIds = [
    ...new Set(
      rows
        .map((r) => r.recipient_customer_id)
        .filter((id): id is number => id !== null && id !== undefined && Number.isFinite(Number(id))),
    ),
  ];

  let customersById: Record<number, CustomerPublic> = {};
  if (recipientIds.length > 0) {
    const { data: custRows } = await supabase
      .from("customers")
      .select("id, email, first_name, last_name")
      .in("id", recipientIds);
    for (const c of custRows ?? []) {
      const m = mapCustomer(c as Record<string, unknown>);
      customersById[Number.parseInt(m.id, 10)] = m;
    }
  }

  return rows.map((r) => {
    const share = mapShareRow(r);
    const rid = share.recipientCustomerId;
    return {
      ...share,
      recipient: rid !== null ? customersById[rid] ?? null : null,
    };
  });
}

export async function listIncomingProfileShares(recipientCustomerId: string): Promise<IncomingShareListItem[]> {
  const supabase = await createSupabaseServerClient();
  const rid = Number.parseInt(recipientCustomerId, 10);
  const { data, error } = await supabase
    .from("customer_profile_shares")
    .select("*")
    .not("recipient_customer_id", "is", null)
    .eq("recipient_customer_id", rid)
    .order("created_at", { ascending: false });

  if (error || !data?.length) return [];

  const rows = data as Record<string, unknown>[];
  const ownerIds = [...new Set(rows.map((r) => Number(r.owner_customer_id)).filter(Boolean))];
  const { data: owners } = await supabase
    .from("customers")
    .select("id, email, first_name, last_name")
    .in("id", ownerIds);

  const ownerById: Record<number, CustomerPublic> = {};
  for (const o of owners ?? []) {
    const m = mapCustomer(o as Record<string, unknown>);
    ownerById[Number.parseInt(m.id, 10)] = m;
  }

  return rows.map((r) => {
    const share = mapShareRow(r);
    const owner = ownerById[share.ownerCustomerId];
    if (!owner) {
      return { ...share, owner: { id: "", email: "", firstName: "", lastName: "" } };
    }
    return { ...share, owner };
  });
}

export async function createProfileShare(
  ownerCustomerId: string,
  recipientEmailRaw: string,
): Promise<{ ok: true; share: CustomerProfileShareRow } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const recipientEmail = normalizeShareEmail(recipientEmailRaw);
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const oid = Number.parseInt(ownerCustomerId, 10);
  const { data: ownerRow } = await supabase
    .from("customers")
    .select("id, email")
    .eq("id", oid)
    .single();
  if (!ownerRow) return { ok: false, error: "Account not found." };
  const ownerEmail = normalizeShareEmail(String((ownerRow as { email?: string }).email ?? ""));
  if (recipientEmail === ownerEmail) {
    return { ok: false, error: "You cannot share with your own email." };
  }

  const recipient = await fetchCustomerByEmail(supabase, recipientEmail);
  if (recipient && Number.parseInt(recipient.id, 10) === oid) {
    return { ok: false, error: "You cannot share with yourself." };
  }

  const insert: Record<string, unknown> = {
    owner_customer_id: oid,
    recipient_email: recipientEmail,
    status: recipient ? "pending_accept" : "pending_recipient",
    updated_at: new Date().toISOString(),
  };
  if (recipient) {
    insert.recipient_customer_id = Number.parseInt(recipient.id, 10);
  }

  const { data, error } = await supabase.from("customer_profile_shares").insert(insert).select("*").single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "You already have an open invite for this person." };
    }
    return { ok: false, error: error.message || "Could not create share." };
  }

  return { ok: true, share: mapShareRow(data as Record<string, unknown>) };
}

export async function getActiveShareForRecipient(
  shareId: string,
  recipientCustomerId: string,
): Promise<
  | { ok: true; share: CustomerProfileShareRow; owner: CustomerPublic }
  | { ok: false; reason: "not_found" }
> {
  const supabase = await createSupabaseServerClient();
  const rid = Number.parseInt(recipientCustomerId, 10);
  const { data, error } = await supabase
    .from("customer_profile_shares")
    .select("*")
    .eq("id", shareId)
    .eq("recipient_customer_id", rid)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "not_found" };

  const share = mapShareRow(data as Record<string, unknown>);
  const { data: owner } = await supabase
    .from("customers")
    .select("id, email, first_name, last_name")
    .eq("id", share.ownerCustomerId)
    .single();

  if (!owner) return { ok: false, reason: "not_found" };
  return { ok: true, share, owner: mapCustomer(owner as Record<string, unknown>) };
}

export async function acceptProfileShare(
  shareId: string,
  recipientCustomerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const rid = Number.parseInt(recipientCustomerId, 10);
  const { data: row, error: fetchErr } = await supabase
    .from("customer_profile_shares")
    .select("*")
    .eq("id", shareId)
    .maybeSingle();

  if (fetchErr || !row) return { ok: false, error: "Invite not found." };
  const share = mapShareRow(row as Record<string, unknown>);
  if (share.recipientCustomerId !== rid) return { ok: false, error: "Not your invite." };
  if (share.status !== "pending_accept") return { ok: false, error: "This invite is not pending." };

  const { error } = await supabase
    .from("customer_profile_shares")
    .update({
      status: "active",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", shareId)
    .eq("recipient_customer_id", rid);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function declineProfileShare(
  shareId: string,
  recipientCustomerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const rid = Number.parseInt(recipientCustomerId, 10);
  const { data: row } = await supabase.from("customer_profile_shares").select("*").eq("id", shareId).maybeSingle();
  if (!row) return { ok: false, error: "Invite not found." };
  const share = mapShareRow(row as Record<string, unknown>);
  if (share.recipientCustomerId !== rid) return { ok: false, error: "Not your invite." };
  if (share.status !== "pending_accept") return { ok: false, error: "This invite is not pending." };

  const { error } = await supabase
    .from("customer_profile_shares")
    .update({
      status: "declined",
      updated_at: new Date().toISOString(),
    })
    .eq("id", shareId)
    .eq("recipient_customer_id", rid);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function revokeProfileShare(
  shareId: string,
  ownerCustomerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const oid = Number.parseInt(ownerCustomerId, 10);
  const { data: row } = await supabase.from("customer_profile_shares").select("*").eq("id", shareId).maybeSingle();
  if (!row) return { ok: false, error: "Share not found." };
  const share = mapShareRow(row as Record<string, unknown>);
  if (share.ownerCustomerId !== oid) return { ok: false, error: "Not your share." };
  if (share.status === "revoked" || share.status === "declined") {
    return { ok: false, error: "Already inactive." };
  }

  const { error } = await supabase
    .from("customer_profile_shares")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", shareId)
    .eq("owner_customer_id", oid);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
