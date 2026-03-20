import fs from "fs/promises";
import path from "path";

type StatusPayload = {
  setCode: string;
  setName?: string;
  source: string;
  created: number;
  updated: number;
  skipped: number;
  imageLinksUpdated?: number;
};

const STATUS_DOC_PATH = path.resolve(process.cwd(), "docs/card-import-status.md");

type StatusRow = {
  setCode: string;
  setName: string;
  source: string;
  created: number;
  updated: number;
  skipped: number;
  imageLinksUpdated: number;
  lastImportedAt: string;
  status?: "completed" | "incomplete";
};

const parseNumber = (value: string): number => {
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : 0;
};

const parseExistingRows = (content: string): StatusRow[] => {
  const rows: StatusRow[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (line.includes("Set Code") || line.includes("---")) continue;
    const parts = line
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length !== 8 && parts.length !== 9) continue;

    // Backward-compatible parsing:
    // - 8 columns: Set Code | Source | Created | Updated | Skipped | Image Links Updated | Last Imported
    // - 9 columns: Set Code | Set Name | Status | Source | Created | Updated | Skipped | Image Links Updated | Last Imported
    if (parts.length === 8) {
      rows.push({
        setCode: parts[0],
        setName: "_unknown_",
        source: parts[1],
        created: parseNumber(parts[2]),
        updated: parseNumber(parts[3]),
        skipped: parseNumber(parts[4]),
        imageLinksUpdated: parseNumber(parts[5]),
        lastImportedAt: parts[6],
        status: parseNumber(parts[2]) + parseNumber(parts[3]) > 0 ? "completed" : "incomplete",
      });
      continue;
    }

    rows.push({
      setCode: parts[0],
      setName: parts[1],
      status:
        parts[2] === "completed" || parts[2] === "incomplete"
          ? parts[2]
          : parseNumber(parts[4]) + parseNumber(parts[5]) > 0
            ? "completed"
            : "incomplete",
      source: parts[3],
      created: parseNumber(parts[4]),
      updated: parseNumber(parts[5]),
      skipped: parseNumber(parts[6]),
      imageLinksUpdated: parseNumber(parts[7]),
      lastImportedAt: parts[8],
    });
  }
  return rows;
};

const renderDoc = (rows: StatusRow[]): string => {
  const sorted = [...rows].sort((a, b) => a.setCode.localeCompare(b.setCode));
  const header = [
    "# Card Import Status",
    "",
    "Tracks which card sets have been imported into `master-card-list` and which are still pending.",
    "",
    "| Set Code | Set Name | Status | Source | Created | Updated | Skipped | Image Links Updated | Last Imported (UTC) |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
  ];

  const body =
    sorted.length === 0
      ? ["| _none_ | _none_ | _none_ | _none_ | 0 | 0 | 0 | 0 | _never_ |"]
      : sorted.map(
          (r) =>
            `| ${r.setCode} | ${r.setName || "_unknown_"} | ${r.status || (r.created + r.updated > 0 ? "completed" : "incomplete")} | ${r.source} | ${r.created} | ${r.updated} | ${r.skipped} | ${r.imageLinksUpdated} | ${r.lastImportedAt} |`,
        );

  return `${header.join("\n")}\n${body.join("\n")}\n`;
};

export const updateCardImportStatusDoc = async (payload: StatusPayload): Promise<void> => {
  let existingRows: StatusRow[] = [];

  try {
    const content = await fs.readFile(STATUS_DOC_PATH, "utf8");
    existingRows = parseExistingRows(content);
  } catch {
    existingRows = [];
  }

  const now = new Date().toISOString();
  const nextRow: StatusRow = {
    setCode: payload.setCode,
    setName: payload.setName || "_unknown_",
    source: payload.source,
    created: payload.created,
    updated: payload.updated,
    skipped: payload.skipped,
    imageLinksUpdated: payload.imageLinksUpdated ?? 0,
    lastImportedAt: now,
    status: "completed",
  };

  const withoutCurrent = existingRows.filter((r) => r.setCode !== payload.setCode);
  const next = [...withoutCurrent, nextRow];
  await fs.writeFile(STATUS_DOC_PATH, renderDoc(next), "utf8");
};

export const mergeIncompleteSetCodes = async (
  sets: Array<{ code: string; name: string }>,
): Promise<void> => {
  let existingRows: StatusRow[] = [];
  try {
    const content = await fs.readFile(STATUS_DOC_PATH, "utf8");
    existingRows = parseExistingRows(content);
  } catch {
    existingRows = [];
  }

  const byCode = new Map(existingRows.map((r) => [r.setCode, r]));
  for (const set of sets) {
    const code = set.code;
    if (!code) continue;
    if (!byCode.has(code)) {
      byCode.set(code, {
        setCode: code,
        setName: set.name || "_unknown_",
        status: "incomplete",
        source: "pending",
        created: 0,
        updated: 0,
        skipped: 0,
        imageLinksUpdated: 0,
        lastImportedAt: "_never_",
      });
    } else {
      const existing = byCode.get(code)!;
      if (!existing.setName || existing.setName === "_unknown_") {
        existing.setName = set.name || existing.setName;
      }
    }
  }

  // Keep only codes that still exist in sets.
  const allow = new Set(sets.map((s) => s.code).filter(Boolean));
  const merged = [...byCode.values()].filter((r) => allow.has(r.setCode));
  await fs.writeFile(STATUS_DOC_PATH, renderDoc(merged), "utf8");
};

