/**
 * National dex numbers for MEP promos where we do not scrape Bulbapedia.
 * Keys are normalised English card names from Scrydex.
 */

export const MEP_KNOWN_DEX_BY_NAME: Record<string, number[]> = {
  "mega charizard x ex": [6],
  "mega charizard y ex": [6],
  "mega gardevoir ex": [282],
  "mega lucario ex": [448],
  "n's zekrom": [644],
  bulbasaur: [1],
  charmander: [4],
  squirtle: [7],
  turtwig: [387],
  chimchar: [390],
  piplup: [393],
  rowlet: [722],
  litten: [725],
  popplio: [728],
  serperior: [497],
  barbaracle: [689],
  tyrantrum: [697],
  doublade: [680],
};

export function dexIdForMepName(displayName: string): number[] {
  const key = displayName
    .toLowerCase()
    .trim()
    .replace(/[\u2019`´]/g, "'");
  return MEP_KNOWN_DEX_BY_NAME[key] ?? [];
}
