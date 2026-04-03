import { redirect } from "next/navigation";

type SealedPageProps = {
  searchParams?: Promise<{
    take?: string;
    page?: string;
    search?: string;
    q?: string;
    type?: string;
    series?: string;
    sort?: string;
  }>;
};

export default async function SealedPage({ searchParams }: SealedPageProps) {
  const params = (await searchParams) ?? {};
  const nextParams = new URLSearchParams();
  nextParams.set("tab", "sealed");
  if ((params.take ?? "").trim()) nextParams.set("take", params.take!.trim());
  if ((params.page ?? "").trim()) nextParams.set("page", params.page!.trim());
  if ((params.search ?? "").trim()) nextParams.set("search", params.search!.trim());
  if ((params.q ?? "").trim() && !nextParams.has("search")) nextParams.set("search", params.q!.trim());
  if ((params.type ?? "").trim()) nextParams.set("type", params.type!.trim());
  if ((params.series ?? "").trim()) nextParams.set("series", params.series!.trim());
  if ((params.sort ?? "").trim()) nextParams.set("sort", params.sort!.trim());
  redirect(`/search?${nextParams.toString()}`);
}
