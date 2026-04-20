import path from "path";

/**
 * On-disk root for Pokémon TCG static JSON (`sets`, `cards`, `pricing` mirror, sealed catalog).
 * R2 object keys remain `data/…` and `pricing/…`; this is only the local repo layout under `data/pokemon/`.
 */
export const pokemonLocalDataRoot = path.join(process.cwd(), "data", "pokemon");
