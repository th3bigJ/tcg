import pino from "pino";
import { defaultLoggerOptions } from "payload";

function isAbortErrorLike(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    return /request aborted|operation was aborted/i.test(value);
  }
  if (typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (o.name === "AbortError") return true;
  if (typeof o.message === "string" && /request aborted|operation was aborted/i.test(o.message)) {
    return true;
  }
  if ("cause" in o && o.cause) return isAbortErrorLike(o.cause);
  return false;
}

function isAbortLogNoise(arg: unknown): boolean {
  if (isAbortErrorLike(arg)) return true;
  if (arg && typeof arg === "object") {
    const o = arg as Record<string, unknown>;
    if ("err" in o && isAbortErrorLike(o.err)) return true;
    if (typeof o.msg === "string" && /request aborted|operation was aborted/i.test(o.msg)) {
      return true;
    }
  }
  return false;
}

function shouldSuppressErrorArgs(args: unknown[]): boolean {
  return args.some(isAbortLogNoise);
}

/**
 * Pino's `hooks.logMethod` does not reliably run for every `logger.error(...)` shape
 * Payload + storage-s3 use. Intercept `.error` (and `.child`) instead.
 */
function wrapPayloadLogger(logger: pino.Logger): pino.Logger {
  return new Proxy(logger, {
    get(target, prop, receiver) {
      if (prop === "error") {
        const original = Reflect.get(target, "error", receiver);
        if (typeof original !== "function") return original;
        return function errorFiltered(this: unknown, ...args: unknown[]) {
          if (shouldSuppressErrorArgs(args)) return;
          return original.apply(target, args as Parameters<typeof original>);
        };
      }

      if (prop === "child") {
        const originalChild = Reflect.get(target, "child", receiver) as pino.Logger["child"];
        if (typeof originalChild !== "function") return originalChild;
        return (...childArgs: Parameters<pino.Logger["child"]>) => {
          const child = originalChild.apply(target, childArgs);
          return wrapPayloadLogger(child as unknown as pino.Logger);
        };
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  }) as pino.Logger;
}

/**
 * Logger for Payload: same pretty output as default, but skips ERROR when the client
 * disconnects before S3/R2 streaming finishes (browser cancel / navigation).
 */
export function createPayloadLogger(): pino.Logger {
  const base = pino(
    {
      name: "payload",
      enabled: process.env.DISABLE_LOGGING !== "true",
    },
    defaultLoggerOptions,
  );
  return wrapPayloadLogger(base);
}
