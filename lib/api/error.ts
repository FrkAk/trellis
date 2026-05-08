import { error } from "@/lib/api/response";

/**
 * Whether internal errors should be returned to the client verbatim. Off
 * by default — in production we never want to leak SQL fragments, bound
 * parameters, or internal stack traces. Flip via `MYMIR_API_VERBOSE_ERRORS=1`
 * in `.env.local` when actively debugging a 500 in dev.
 *
 * Read at call time so tests can mutate `process.env` between cases without
 * re-importing the module.
 *
 * @returns True when the env var is set to `"1"`.
 */
function isVerboseErrors(): boolean {
  return process.env.MYMIR_API_VERBOSE_ERRORS === "1";
}

/**
 * Centralized 500 emitter for route handlers. Always logs the error
 * server-side with a route-scoped label so failures are visible in the
 * dev terminal / production logs even when the response body is generic.
 *
 * In default mode the response body is `{ error: "Internal error" }` —
 * intentionally opaque so untrusted callers can't enumerate schema names,
 * SQL structure, or auth ids that show up in driver-level errors. Set
 * `MYMIR_API_VERBOSE_ERRORS=1` to forward the raw `err.message` to the
 * client; only use this in dev when chasing a specific 500.
 *
 * @param label - Route-scoped tag (e.g. `"projects"`, `"task-context"`).
 * @param err - The thrown error.
 * @returns 500 JSON response.
 */
export function internalError(label: string, err: unknown): Response {
  console.error(`[${label}] error:`, err);
  const message =
    isVerboseErrors() && err instanceof Error ? err.message : "Internal error";
  return error(message, 500);
}
