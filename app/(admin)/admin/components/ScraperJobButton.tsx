"use client";

import { useRef, useState } from "react";

type ScraperJobButtonProps = {
  label: string;
  endpoint: string;
  body?: Record<string, unknown>;
};

type LogEntry = { text: string; isError?: boolean };

export function ScraperJobButton({ label, endpoint, body = {} }: ScraperJobButtonProps) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLPreElement>(null);

  function addLog(text: string, isError = false) {
    setLogs((prev) => {
      const next = [...prev, { text, isError }];
      // Auto-scroll
      requestAnimationFrame(() => {
        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      });
      return next;
    });
  }

  async function run() {
    setRunning(true);
    setDone(false);
    setLogs([]);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        addLog(`HTTP ${res.status}: ${await res.text()}`, true);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              log?: string;
              done?: boolean;
              error?: string;
            };
            if (payload.log) addLog(payload.log);
            if (payload.error) {
              addLog(`Error: ${payload.error}`, true);
              setRunning(false);
              setDone(true);
            }
            if (payload.done) {
              addLog("✓ Done.");
              setRunning(false);
              setDone(true);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (err) {
      addLog(`Fetch error: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={running}
        className="flex items-center gap-2 rounded bg-neutral-800 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-700 dark:hover:bg-neutral-600"
      >
        {running && (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
        )}
        {done && !running && <span className="text-green-400">✓</span>}
        {label}
      </button>

      {logs.length > 0 && (
        <pre
          ref={logRef}
          className="max-h-48 overflow-y-auto rounded bg-neutral-900 p-2 font-mono text-xs leading-relaxed text-green-400"
        >
          {logs.map((l, i) => (
            <span key={i} className={l.isError ? "text-red-400" : undefined}>
              {l.text}
              {i < logs.length - 1 ? "\n" : ""}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}
