/**
 * Parse structured card text fields from Scrydex Pokémon card HTML.
 * Primary source: dev-pane `data-target-field="…"` blocks (stable model values).
 *
 * @see https://scrydex.com/pokemon/cards/ceruledge/mep-14
 */

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

/** Scrydex card id, e.g. `me2pt5-256`, `sv1-1`. */
export function parseScrydexCardId(html: string): string | null {
  return parseScrydexDevPaneField(html, "id");
}

/** Printed number as shown on the card (may include fraction), e.g. `256/217`, `014`. */
export function parseScrydexPrintedNumber(html: string): string | null {
  return parseScrydexDevPaneField(html, "printed_number");
}

export function parseScrydexSupertype(html: string): string | null {
  return parseScrydexDevPaneField(html, "supertype");
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
  return parseScrydexDevPaneField(html, "flavor_text");
}
