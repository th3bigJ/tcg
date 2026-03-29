import { redirect } from "next/navigation";

/** List view lives under Search → Pokédex tab */
export default function PokedexIndexPage() {
  redirect("/search?tab=pokedex");
}
