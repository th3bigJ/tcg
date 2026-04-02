import { redirect } from "next/navigation";

type PokedexPokemonCardsPageProps = {
  params: Promise<{ nationalDex: string }>;
  searchParams?: Promise<Record<string, string>>;
};

export default async function PokedexPokemonCardsPage({
  params,
  searchParams,
}: PokedexPokemonCardsPageProps) {
  const { nationalDex: rawDex } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const dexNum = Number.parseInt(decodeURIComponent(rawDex).trim(), 10);

  const nextParams = new URLSearchParams(resolvedSearchParams);
  if (Number.isFinite(dexNum) && dexNum > 0) {
    nextParams.set("pokemon", String(dexNum));
  }
  nextParams.delete("take");

  redirect(`/search?${nextParams.toString()}`);
}
