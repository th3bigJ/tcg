/**
 * Runs `populateMegaEvolutionTcgdexIdExact.ts` for many sets in **parallel blocks of N**
 * (default 5), then refreshes `docs/tcgdex-id-by-series.*` and `docs/tcgdex-id-by-set.*`
 * after each block completes.
 *
 * Usage:
 *   node --import tsx/esm scripts/runTcgdexIdPopulateBlocks.ts
 *   node --import tsx/esm scripts/runTcgdexIdPopulateBlocks.ts --block-size=5 --start-line=10 --end-line=196
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import nextEnvImport from "@next/env";

import { writeTcgdexIdProgressFiles } from "../lib/exportTcgdexIdStats";

function runNodeScript(
  repoRoot: string,
  scriptRelativePath: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx/esm", scriptRelativePath],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}

function getArgNumber(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const arg = process.argv.find((v) => v.startsWith(prefix));
  if (!arg) return fallback;
  const n = Number(arg.slice(prefix.length));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function getArgNumberLine(name: string, fallback: number): number {
  return getArgNumber(name, fallback);
}

function parseSetTcgdexIdsFromMarkdownTable(
  lines: string[],
  startLine1: number,
  endLine1: number,
): string[] {
  /** Preserve table row order (same as `tcgdex-id-by-set.md`). */
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (let i = startLine1 - 1; i < endLine1 && i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;
    const parts = line.split("|");
    if (parts.length < 5) continue;
    // | Series | Set name | set_tcgdex_id | Total cards | ...
    const setTcgdexId = parts[3]?.trim() ?? "";
    if (setTcgdexId && !seen.has(setTcgdexId)) {
      seen.add(setTcgdexId);
      ordered.push(setTcgdexId);
    }
  }
  return ordered;
}

function spawnPopulateSet(
  repoRoot: string,
  setTcgdexId: string,
): Promise<{ setTcgdexId: string; code: number }> {
  return new Promise((resolve, reject) => {
    const MAX_RUNTIME_MS = 180_000;
    const logPath = path.join("/tmp", `tcg-populate-${setTcgdexId}.log`);
    const log = createWriteStream(logPath, { flags: "w" });
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx/esm",
        path.join("scripts", "populateMegaEvolutionTcgdexIdExact.ts"),
        `--set-tcgdex-id=${setTcgdexId}`,
        "--set-concurrency=1",
        "--skip-progress-docs",
      ],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let settled = false;
    let sawCompletionMarker = false;
    let completionKillTimer: NodeJS.Timeout | null = null;

    const settle = (code: number) => {
      if (settled) return;
      settled = true;
      if (completionKillTimer) clearTimeout(completionKillTimer);
      clearTimeout(timeoutTimer);
      log.end();
      resolve({ setTcgdexId, code });
    };

    const onChunk = (buf: Buffer) => {
      log.write(buf);
      const text = buf.toString("utf8");
      if (!sawCompletionMarker && text.includes("tcgdex_id population complete.")) {
        sawCompletionMarker = true;
        // Some set runs print completion but keep the event loop alive.
        // Terminate shortly after completion marker so block runners do not hang.
        completionKillTimer = setTimeout(() => {
          if (!settled) child.kill("SIGTERM");
        }, 1200);
      }
    };

    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);

    const timeoutTimer = setTimeout(() => {
      if (!settled) {
        child.kill("SIGTERM");
      }
    }, MAX_RUNTIME_MS);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (completionKillTimer) clearTimeout(completionKillTimer);
      clearTimeout(timeoutTimer);
      log.end();
      reject(err);
    });

    child.on("close", (code) => {
      const normalizedCode = code ?? 0;
      if (normalizedCode === 0 || sawCompletionMarker) {
        settle(0);
        return;
      }
      settle(normalizedCode);
    });
  });
}

async function run() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const repoRoot = process.cwd();
  const blockSize = getArgNumber("block-size", 5);
  const startLine = getArgNumberLine("start-line", 10);
  const endLine = getArgNumberLine("end-line", 196);
  const mdPath = path.join(repoRoot, "docs", "tcgdex-id-by-set.md");

  const raw = await readFile(mdPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const setIds = parseSetTcgdexIdsFromMarkdownTable(lines, startLine, endLine);

  console.log(
    JSON.stringify(
      {
        mdPath,
        startLine,
        endLine,
        blockSize,
        totalSets: setIds.length,
      },
      null,
      2,
    ),
  );

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    for (let i = 0; i < setIds.length; i += blockSize) {
      const blockNum = Math.floor(i / blockSize) + 1;
      const block = setIds.slice(i, i + blockSize);
      console.log(`\n=== Block ${blockNum} (${block.length} sets): ${block.join(", ")} ===`);

      const results = await Promise.all(block.map((sid) => spawnPopulateSet(repoRoot, sid)));
      for (const r of results) {
        if (r.code !== 0) {
          console.error(`[${r.setTcgdexId}] exited with code ${r.code} (see /tmp/tcg-populate-${r.setTcgdexId}.log)`);
        }
      }

      const { generatedAt, paths } = await writeTcgdexIdProgressFiles(payload, {
        series: true,
        sets: true,
      });
      const noPricingExportCode = await runNodeScript(
        repoRoot,
        path.join("scripts", "exportNoPricingBySet.ts"),
      );
      if (noPricingExportCode !== 0) {
        console.error(
          `Block ${blockNum}: exportNoPricingBySet failed with exit code ${noPricingExportCode}`,
        );
      }
      console.log(
        `=== Block ${blockNum} complete: refreshed ${paths.setMarkdown ?? ""}, series, and tcgdex-no-pricing-by-set (UTC ${generatedAt}) ===`,
      );
    }

    console.log("\nALL BLOCKS COMPLETE");
  } finally {
    await payload.destroy();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
