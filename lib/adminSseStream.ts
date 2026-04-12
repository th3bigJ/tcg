/**
 * Creates a streaming SSE Response that runs `job` and pipes console.log output
 * to the client as `data: {"log":"..."}` events.
 *
 * The job receives an `onLog` callback. Consumers should call `onLog` rather
 * than relying on console.log patching where possible.
 */
export function createScraperSseResponse(
  job: (onLog: (line: string) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function emit(payload: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Controller may be closed if client disconnected
        }
      }

      function onLog(line: string) {
        emit({ log: line });
      }

      // Also capture console.log for job functions that don't accept onLog
      const origLog = console.log;
      const origWarn = console.warn;
      console.log = (...args: unknown[]) => {
        origLog(...args);
        onLog(args.map(String).join(" "));
      };
      console.warn = (...args: unknown[]) => {
        origWarn(...args);
        onLog("[warn] " + args.map(String).join(" "));
      };

      job(onLog)
        .then(() => {
          emit({ done: true });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          emit({ error: msg });
        })
        .finally(() => {
          console.log = origLog;
          console.warn = origWarn;
          try {
            controller.close();
          } catch {
            // Already closed
          }
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
