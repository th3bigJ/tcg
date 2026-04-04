import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root (parent of `scripts/`), not `process.cwd()` — npm may run with a different cwd. */
export function getRepoRootFromScriptsDir(importMetaUrl: string): string {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}

function applyEnvFile(path: string, override: boolean): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!override && process.env[key] !== undefined) continue;
    process.env[key] = val;
  }
}

/** Loads `.env` then `.env.local` from the repo root (via `import.meta.url`) and again from `cwd()` if different. */
export function loadEnvFilesFromRepoRoot(importMetaUrl: string): void {
  const roots = [...new Set([getRepoRootFromScriptsDir(importMetaUrl), process.cwd()])];
  for (const root of roots) {
    applyEnvFile(resolve(root, ".env"), false);
    applyEnvFile(resolve(root, ".env.local"), true);
  }
}
