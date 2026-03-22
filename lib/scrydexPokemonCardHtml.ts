/**
 * Extract "Model attributes" field values from a Scrydex Pokémon card HTML page.
 * Relies on the dev-pane hoverBlock markup (stable enough for our seed workflow).
 */

export type ScrydexFieldMap = Record<string, string[]>;

const VALUE_DIV_RE =
  /<div class="overflow-x-auto border border-transparent bg-mono-2\/20 p-2 text-body-12 text-mono-4 group-hover:border-primary">([^<]*)<\/div>/;

export function parseScrydexCardHoverFields(html: string): ScrydexFieldMap {
  const chunks = html.split('data-global-target="hoverBlock"');
  const out: ScrydexFieldMap = {};

  for (const chunk of chunks) {
    const fieldM = chunk.match(/data-target-field="([^"]+)"/);
    if (!fieldM) continue;
    const field = fieldM[1];
    const valM = chunk.match(VALUE_DIV_RE);
    if (!valM) continue;
    const raw = valM[1].trim();
    if (!out[field]) out[field] = [];
    out[field].push(decodeBasicEntities(raw));
  }

  return out;
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function splitCsvField(s: string): string[] {
  return s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function parseScrydexSubtypes(csv: string | undefined): string[] {
  if (!csv || csv === "-") return [];
  return splitCsvField(csv);
}

/** Map "Basic" | "Stage 1" | "Stage 2" to Card.stage literal. */
export function stageFromSubtypes(subtypes: string[]): "Basic" | "Stage1" | "Stage2" | undefined {
  if (subtypes.includes("Stage 2")) return "Stage2";
  if (subtypes.includes("Stage 1")) return "Stage1";
  if (subtypes.includes("Basic")) return "Basic";
  return undefined;
}

export function zipAttacks(fields: ScrydexFieldMap): Array<{
  name: string;
  damage: string;
  text: string;
}> {
  const names = fields["attacks.name"] || [];
  const damages = fields["attacks.damage"] || [];
  const texts = fields["attacks.text"] || [];
  const n = Math.max(names.length, damages.length, texts.length);
  const rows: Array<{ name: string; damage: string; text: string }> = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      name: names[i] ?? "",
      damage: damages[i] ?? "",
      text: texts[i] ?? "",
    });
  }
  return rows.filter((r) => r.name || r.damage || r.text);
}

export function zipAbilities(fields: ScrydexFieldMap): Array<{
  type: string;
  name: string;
  text: string;
}> {
  const types = fields["abilities.type"] || [];
  const names = fields["abilities.name"] || [];
  const texts = fields["abilities.text"] || [];
  const n = Math.max(types.length, names.length, texts.length);
  const rows: Array<{ type: string; name: string; text: string }> = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      type: types[i] ?? "",
      name: names[i] ?? "",
      text: texts[i] ?? "",
    });
  }
  return rows.filter((r) => r.name || r.text);
}

export function retreatCountFromRetreatCost(raw: string | undefined): number | undefined {
  if (!raw || raw === "-") return undefined;
  const parts = splitCsvField(raw);
  return parts.length > 0 ? parts.length : undefined;
}
