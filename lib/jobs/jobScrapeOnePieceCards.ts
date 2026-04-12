import { spawn } from "child_process";
import path from "path";

export interface ScrapeOnePieceCardsOptions {
  dryRun?: boolean;
  noImages?: boolean;
  refreshImages?: boolean;
  skipR2?: boolean;
  onlySetCodes?: string[];
}

/**
 * Runs the One Piece cards scraper as a child process and streams log lines
 * to the provided callback. Resolves when the process exits successfully,
 * rejects on non-zero exit.
 */
export async function runScrapeOnePieceCards(
  opts: ScrapeOnePieceCardsOptions = {},
  onLog?: (line: string) => void,
): Promise<void> {
  const repoRoot = path.join(path.dirname(new URL(import.meta.url).pathname), "../..");
  const scriptPath = path.join(repoRoot, "scripts", "scrapeOnePieceCards.ts");

  const args: string[] = [];
  if (opts.dryRun) args.push("--dry-run");
  if (opts.noImages) args.push("--no-images");
  if (opts.refreshImages) args.push("--refresh-images");
  if (opts.skipR2) args.push("--skip-r2");
  if (opts.onlySetCodes?.length) args.push(`--set=${opts.onlySetCodes.join(",")}`);

  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      ["--import", "tsx/esm", scriptPath, ...args],
      { cwd: repoRoot, env: process.env },
    );

    child.stdout.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) onLog?.(line);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) onLog?.(`[stderr] ${line}`);
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`scrapeOnePieceCards exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}
