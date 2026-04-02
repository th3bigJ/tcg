import { redirect } from "next/navigation";

type ExpansionSetCardsPageProps = {
  params: Promise<{ setCode: string }>;
  searchParams?: Promise<Record<string, string>>;
};

export default async function ExpansionSetCardsPage({
  params,
  searchParams,
}: ExpansionSetCardsPageProps) {
  const { setCode: rawSetCode } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const activeSet = decodeURIComponent(rawSetCode).trim();

  const nextParams = new URLSearchParams(resolvedSearchParams);
  nextParams.set("set", activeSet);
  nextParams.delete("take");

  redirect(`/search?${nextParams.toString()}`);
}
