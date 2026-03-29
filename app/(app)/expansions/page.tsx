import { redirect } from "next/navigation";

/** List view lives under Search → Sets tab */
export default function ExpansionsIndexPage() {
  redirect("/search?tab=sets");
}
