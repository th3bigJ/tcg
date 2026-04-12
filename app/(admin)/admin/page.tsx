import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { AdminClientShell } from "./AdminClientShell";

export default async function AdminPage() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/login");
  }

  const mediaBaseUrl =
    process.env.R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ??
    "";

  return <AdminClientShell mediaBaseUrl={mediaBaseUrl} />;
}
