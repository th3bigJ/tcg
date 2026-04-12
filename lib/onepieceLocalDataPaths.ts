import path from "path";

/**
 * On-disk root for One Piece static data (sets, cards, pricing). R2 keys stay under the
 * `onepiece/` prefix; locally the tree lives under `data/onepiece/`.
 */
export const onepieceLocalDataRoot = path.join(process.cwd(), "data", "onepiece");
