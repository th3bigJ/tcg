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
};

/**
 * Pokémon attack rows from the Attacks table (name + damage columns).
 */
export function parseScrydexCardAttacks(html: string): ScrydexParsedAttack[] {
  const label = ">Attacks</div><table";
  const start = html.indexOf(label);
  if (start < 0) return [];

  const slice = html.slice(start, start + 120000);
  const tableEnd = slice.indexOf("</table>");
  if (tableEnd < 0) return [];
  const tbody = slice.slice(0, tableEnd);

  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const out: ScrydexParsedAttack[] = [];

  for (const row of rows) {
    if (!row.includes('data-field="attacks.name"')) continue;
    const nameM = row.match(/<span class="text-white">([^<]+)<\/span>/);
    const dmgM = row.match(/<span class="text-body-20 text-white">([^<]*)<\/span>/);
    const name = nameM ? decodeHtmlEntities(nameM[1].trim()) : "";
    if (!name) continue;
    const rawDmg = dmgM ? dmgM[1].trim() : "";
    out.push({ name, damage: rawDmg.length ? rawDmg : null });
  }

  return out;
}
