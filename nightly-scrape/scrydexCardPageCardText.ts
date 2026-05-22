/**
 * Parse structured card text fields from Scrydex Pokémon card HTML.
 * Primary source: `data-terminal-trigger-json-value` (API-shaped card JSON).
 * Falls back to dev-pane `data-target-field` and DOM tables when needed.
 *
 * @see https://scrydex.com/pokemon/cards/ceruledge/mep-14
 */

import type { CardJsonEntry } from "./staticDataTypes.js";

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/** Scrydex error / maintenance HTML (not a card page). */
export function isScrydexErrorPage(html: string): boolean {
  return html.includes("Woops! We hit a snag") || html.includes("Something Went Wrong (500)");
}

/**
 * Read a scalar field from the right-hand dev pane (`data-target-field="id"`, etc.).
 */
export function parseScrydexDevPaneField(html: string, field: string): string | null {
  const esc = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `data-target-field="${esc}"[\\s\\S]*?<div class="overflow-x-auto[^"]*">([^<]*)</div>`,
    "i",
  );
  const m = html.match(re);
  if (!m) return null;
  const v = decodeHtmlEntities(m[1].trim());
  if (!v || v === "-") return null;
  return v;
}

/** Card payload embedded in `data-terminal-trigger-json-value` on Scrydex card pages. */
export type ScrydexTerminalCardData = {
  id: string;
  name: string;
  printed_number?: string;
  rarity?: string;
  supertype?: string;
  hp?: string;
  regulation_mark?: string;
  flavor_text?: string;
  artist?: string;
  subtypes?: string[];
  types?: string[];
  national_pokedex_numbers?: number[];
  rules?: string[];
  abilities?: Array<{ type?: string; name: string; text?: string }>;
  attacks?: Array<{ name: string; damage?: string; text?: string; cost?: string[] }>;
  weaknesses?: Array<{ type: string; value: string }>;
  resistances?: Array<{ type: string; value: string }>;
  retreat_cost?: string[];
  converted_retreat_cost?: number;
};

const TERMINAL_JSON_RE =
  /data-terminal-trigger-json-value="(\{&quot;data&quot;:[\s\S]*?\})"/;

/** Parse the API-shaped card object Scrydex embeds in the card page HTML. */
export function parseScrydexTerminalCardData(html: string): ScrydexTerminalCardData | null {
  const m = html.match(TERMINAL_JSON_RE);
  if (!m) return null;
  try {
    const decoded = decodeHtmlEntities(m[1]);
    const root = JSON.parse(decoded) as { data?: ScrydexTerminalCardData };
    if (!root.data?.id) return null;
    return root.data;
  } catch {
    return null;
  }
}

function terminalOrDevPane(html: string, field: string): string | null {
  const t = parseScrydexTerminalCardData(html);
  if (!t) return parseScrydexDevPaneField(html, field);
  const map: Record<string, string | undefined> = {
    id: t.id,
    printed_number: t.printed_number,
    supertype: t.supertype,
    rarity: t.rarity,
    hp: t.hp,
    regulation_mark: t.regulation_mark,
    flavor_text: t.flavor_text,
    artist: t.artist,
    subtypes: t.subtypes?.join(", "),
    types: t.types?.join(", "),
  };
  const v = map[field];
  return v && v !== "-" ? v : parseScrydexDevPaneField(html, field);
}

/** Scrydex card id, e.g. `me2pt5-256`, `sv1-1`. */
export function parseScrydexCardId(html: string): string | null {
  return terminalOrDevPane(html, "id");
}

/** Printed number as shown on the card (may include fraction), e.g. `256/217`, `014`. */
export function parseScrydexPrintedNumber(html: string): string | null {
  return terminalOrDevPane(html, "printed_number");
}

export function parseScrydexSupertype(html: string): string | null {
  return terminalOrDevPane(html, "supertype");
}

/**
 * Trainer / item rules: paragraphs under the Rules heading (card Details), before `data-field="rules"`.
 */
export function parseScrydexCardRulesFromDetails(html: string): string | null {
  const label = ">Rules</div>";
  const start = html.indexOf(label);
  if (start < 0) return null;
  const slice = html.slice(start, start + 8000);
  const end = slice.indexOf('data-field="rules"');
  const block = end > 0 ? slice.slice(0, end) : slice;
  const spans = [...block.matchAll(/<span class="block mt-2">([^<]*)<\/span>/g)]
    .map((x) => decodeHtmlEntities(x[1].trim()))
    .filter(Boolean);
  if (!spans.length) return null;
  return spans.join("\n\n");
}

export type ScrydexParsedAttack = {
  name: string;
  damage: string | null;
  cost: string[];
  effect: string | null;
};

export type ScrydexParsedAbility = {
  type: string | null;
  name: string;
  text: string | null;
};

/**
 * Extract energy type from a Scrydex asset URL.
 * e.g. "/assets/fire-76e636....png" → "Fire"
 */
function energyTypeFromSrc(src: string): string {
  const m = src.match(/\/assets\/([a-z]+)-[0-9a-f]{64}\.png/i);
  if (!m) return "Colorless";
  const t = m[1];
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Pokémon attack rows from the Attacks table.
 * Each attack spans two <tbody> rows: the main row (cost/name/damage) and
 * an optional text row (colspan=3) containing the effect text.
 */
export function parseScrydexCardAttacks(html: string): ScrydexParsedAttack[] {
  const label = ">Attacks</div><table";
  const start = html.indexOf(label);
  if (start < 0) return [];

  const slice = html.slice(start, start + 120000);
  // Each attack is wrapped in its own <tbody>
  const tbodies = [...slice.matchAll(/<tbody>([\s\S]*?)<\/tbody>/gi)].map((m) => m[1]);
  const out: ScrydexParsedAttack[] = [];

  for (const tbody of tbodies) {
    if (!tbody.includes('data-field="attacks.name"')) continue;

    // Cost: img tags in the attacks.cost cell
    const costCellM = tbody.match(/data-field="attacks\.cost"[\s\S]*?<\/div><\/div><\/td>/);
    const costSrc = costCellM
      ? [...costCellM[0].matchAll(/<img[^>]+src="([^"]+)"[^>]*\/?>/gi)].map((m) => energyTypeFromSrc(m[1]))
      : [];

    // Name
    const nameM = tbody.match(/<span class="text-white">([^<]+)<\/span>/);
    const name = nameM ? decodeHtmlEntities(nameM[1].trim()) : "";
    if (!name) continue;

    // Damage
    const dmgM = tbody.match(/<span class="text-body-20 text-white">([^<]*)<\/span>/);
    const rawDmg = dmgM ? dmgM[1].trim() : "";

    // Effect text: <p class="text-mono-4">…</p> in the text row
    const effectM = tbody.match(/<p class="text-mono-4">([^<]*)<\/p>/);
    const rawEffect = effectM ? decodeHtmlEntities(effectM[1].trim()) : "";

    out.push({
      name,
      damage: rawDmg.length ? rawDmg : null,
      cost: costSrc,
      effect: rawEffect.length ? rawEffect : null,
    });
  }

  return out;
}

/**
 * Pokémon abilities from the Abilities section.
 * Structure: abilities.type (img with alt="ability" or similar), abilities.name (span.font-bold),
 * abilities.text (span.text-mono-4).
 */
export function parseScrydexCardAbilities(html: string): ScrydexParsedAbility[] {
  const label = ">Abilities</div>";
  const start = html.indexOf(label);
  if (start < 0) return [];

  // Abilities section ends at the next major section (Attacks or Weaknesses)
  const nextSection = html.indexOf(">Attacks</div>", start);
  const slice = html.slice(start, nextSection > start ? nextSection : start + 10000);

  // Each ability block wraps abilities.type + abilities.name + abilities.text
  // They appear as data-field blocks within the abilities container
  const out: ScrydexParsedAbility[] = [];

  // Find all ability name occurrences to delineate individual ability blocks
  const nameMarker = 'data-field="abilities.name"';
  let searchFrom = 0;
  while (true) {
    const nameIdx = slice.indexOf(nameMarker, searchFrom);
    if (nameIdx < 0) break;

    // Look back ~800 chars for the type block (abilities.type)
    const lookBack = slice.slice(Math.max(0, nameIdx - 800), nameIdx);
    const typeImgM = lookBack.match(/data-field="abilities\.type"[\s\S]*$/);
    let abilityType: string | null = null;
    if (typeImgM) {
      // The visual type is an img with alt="ability" or text inside a span
      const altM = typeImgM[0].match(/<img[^>]+alt="([^"]+)"[^>]*\/?>/i);
      abilityType = altM ? decodeHtmlEntities(altM[1].trim()) : "Ability";
    }

    // Name: bold span immediately following data-field="abilities.name"
    const nameBlock = slice.slice(nameIdx, nameIdx + 300);
    const nameM = nameBlock.match(/<span class="font-bold text-white">([^<]+)<\/span>/);
    const name = nameM ? decodeHtmlEntities(nameM[1].trim()) : "";
    if (!name) { searchFrom = nameIdx + 1; continue; }

    // Text: look ahead for abilities.text
    const textIdx = slice.indexOf('data-field="abilities.text"', nameIdx);
    let text: string | null = null;
    if (textIdx > nameIdx && textIdx < nameIdx + 1500) {
      const textBlock = slice.slice(textIdx, textIdx + 500);
      const textM = textBlock.match(/<span class="text-mono-4">([^<]*)<\/span>/);
      text = textM ? decodeHtmlEntities(textM[1].trim()) || null : null;
    }

    out.push({ type: abilityType, name, text });
    searchFrom = nameIdx + name.length + 1;
  }

  return out;
}

/**
 * Parse weaknesses from the dev pane.
 * Format: `#<OpenStruct type="Water", value="×2">` — extract as "Water ×2".
 * Returns null when empty or none.
 */
export function parseScrydexCardWeakness(html: string): string | null {
  const raw = parseScrydexDevPaneField(html, "weaknesses");
  if (!raw) return null;
  const m = raw.match(/type="([^"]+)",\s*value="([^"]+)"/);
  if (m) return `${m[1]} ${decodeHtmlEntities(m[2])}`;
  return null;
}

/**
 * Parse resistances from the dev pane.
 * Same OpenStruct format as weaknesses. Returns null when empty.
 */
export function parseScrydexCardResistance(html: string): string | null {
  const raw = parseScrydexDevPaneField(html, "resistances");
  if (!raw) return null;
  const m = raw.match(/type="([^"]+)",\s*value="([^"]+)"/);
  if (m) return `${m[1]} ${decodeHtmlEntities(m[2])}`;
  return null;
}

/**
 * Parse retreat cost from the dev pane.
 * Format: "Colorless, Colorless" — count the comma-separated entries.
 * Returns null when no retreat cost data.
 */
export function parseScrydexCardRetreatCost(html: string): number | null {
  const raw = parseScrydexDevPaneField(html, "retreat_cost");
  if (!raw) return null;
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items.length : 0;
}

/**
 * Parse subtype(s) from the dev pane.
 * Format: "Basic" or "Stage 2, ex" — returned as-is (comma-separated string).
 * Returns null when absent.
 */
export function parseScrydexCardSubtype(html: string): string | null {
  return parseScrydexDevPaneField(html, "subtypes");
}

/**
 * Parse flavor text from the dev pane.
 * Returns null when "-" or absent.
 */
export function parseScrydexCardFlavorText(html: string): string | null {
  return terminalOrDevPane(html, "flavor_text");
}

function formatTypeModifier(entries: Array<{ type: string; value: string }> | undefined): string | null {
  if (!entries?.length) return null;
  const first = entries[0];
  if (!first?.type) return null;
  return `${first.type} ${first.value}`.trim();
}

function normalizeCategory(supertype: string | undefined | null): string | null {
  if (!supertype) return null;
  if (supertype === "Pokemon") return "Pokémon";
  return supertype;
}

/**
 * Merge Scrydex terminal JSON (and HTML fallbacks) into a catalog `CardJsonEntry`.
 * Returns true when any field changed.
 */
export function applyScrydexTerminalDataToCard(
  card: CardJsonEntry,
  html: string,
  setName: string,
): boolean {
  const t = parseScrydexTerminalCardData(html);
  let changed = false;

  const set = (field: keyof CardJsonEntry, value: unknown): void => {
    if (value === undefined) return;
    const prev = card[field];
    const nextJson = JSON.stringify(value);
    const prevJson = JSON.stringify(prev ?? null);
    if (nextJson !== prevJson) {
      (card as Record<string, unknown>)[field as string] = value;
      changed = true;
    }
  };

  if (t) {
    set("externalId", t.id);
    set("cardName", t.name);
    if (t.printed_number) {
      set("cardNumber", t.printed_number);
      set("fullDisplayName", `${t.name} ${t.printed_number} ${setName}`.trim());
    }
    set("rarity", t.rarity ?? null);
    const category = normalizeCategory(t.supertype);
    set("category", category);
    const hp = t.hp ? Number.parseInt(t.hp, 10) : null;
    set("hp", hp != null && Number.isFinite(hp) ? hp : null);
    set("elementTypes", t.types?.length ? t.types : null);
    set("dexIds", t.national_pokedex_numbers?.length ? t.national_pokedex_numbers : null);
    set("regulationMark", t.regulation_mark ?? null);
    set("artist", t.artist ?? null);
    set("subtype", t.subtypes?.length ? t.subtypes.join(", ") : null);
    set("weakness", formatTypeModifier(t.weaknesses));
    set("resistance", formatTypeModifier(t.resistances));
    set(
      "retreatCost",
      typeof t.converted_retreat_cost === "number" && Number.isFinite(t.converted_retreat_cost)
        ? t.converted_retreat_cost
        : t.retreat_cost?.length
          ? t.retreat_cost.length
          : null,
    );
    set("flavorText", t.flavor_text ?? null);

    const attacks =
      t.attacks?.map((a) => ({
        name: a.name,
        damage: a.damage?.trim() ? a.damage : null,
        cost: a.cost ?? [],
        effect: a.text?.trim() ? a.text : null,
      })) ?? [];
    set("attacks", attacks.length ? attacks : null);

    const abilities =
      t.abilities?.map((a) => ({
        type: a.type ?? null,
        name: a.name,
        text: a.text?.trim() ? a.text : null,
      })) ?? [];
    set("abilities", abilities.length ? abilities : null);

    const rulesFromApi = t.rules?.filter(Boolean).join("\n\n") || null;
    const rulesFromHtml = parseScrydexCardRulesFromDetails(html);
    set("rules", rulesFromApi ?? rulesFromHtml);

    if (category === "Trainer" && t.subtypes?.length) {
      set("trainerType", t.subtypes[0]);
    }
    if (category === "Energy" && t.subtypes?.length) {
      set("energyType", t.subtypes[0]);
    }
    return changed;
  }

  // Fallback: dev pane + DOM parsers only
  const id = parseScrydexCardId(html);
  if (id) set("externalId", id);
  const printed = parseScrydexPrintedNumber(html);
  if (printed) {
    set("cardNumber", printed);
    set("fullDisplayName", `${card.cardName} ${printed} ${setName}`.trim());
  }
  set("rarity", terminalOrDevPane(html, "rarity"));
  const supertype = parseScrydexSupertype(html);
  set("category", normalizeCategory(supertype));
  const hpRaw = terminalOrDevPane(html, "hp");
  if (hpRaw) {
    const hp = Number.parseInt(hpRaw, 10);
    set("hp", Number.isFinite(hp) ? hp : null);
  }
  const typesRaw = terminalOrDevPane(html, "types");
  if (typesRaw) {
    set("elementTypes", typesRaw.split(",").map((x) => x.trim()).filter(Boolean));
  }
  set("subtype", parseScrydexCardSubtype(html));
  set("weakness", parseScrydexCardWeakness(html));
  set("resistance", parseScrydexCardResistance(html));
  set("retreatCost", parseScrydexCardRetreatCost(html));
  set("flavorText", parseScrydexCardFlavorText(html));
  const attacks = parseScrydexCardAttacks(html);
  set("attacks", attacks.length ? attacks : null);
  const abilities = parseScrydexCardAbilities(html);
  set("abilities", abilities.length ? abilities : null);
  set("rules", parseScrydexCardRulesFromDetails(html));
  set("regulationMark", terminalOrDevPane(html, "regulation_mark"));
  set("artist", terminalOrDevPane(html, "artist"));

  return changed;
}
