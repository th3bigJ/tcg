import { redirect } from "next/navigation";

type ShopPageProps = {
  searchParams?: Promise<Record<string, string>>;
};

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = (await searchParams) ?? {};
  const nextParams = new URLSearchParams(params);
  const query = nextParams.toString();
  redirect(query ? `/sealed?${query}` : "/sealed");
}
