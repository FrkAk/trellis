import { test, expect, beforeEach, afterEach, mock } from "bun:test";
import { internalError } from "@/lib/api/error";

const ENV_KEY = "MYMIR_API_VERBOSE_ERRORS";
const originalConsoleError = console.error;
let consoleSpy: ReturnType<typeof mock>;

beforeEach(() => {
  delete process.env[ENV_KEY];
  consoleSpy = mock(() => {});
  console.error = consoleSpy;
});

afterEach(() => {
  delete process.env[ENV_KEY];
  console.error = originalConsoleError;
});

test("default mode returns generic 'Internal error' body and never leaks the cause", async () => {
  // Regression: PR #65's routes echoed `err.message` from drizzle's
  // 'Failed query' verbatim, which carries the SQL plus bound params
  // (including the authenticated user's id). The default-mode response
  // body must not include any substring from a leaked drizzle error.
  const err = new Error(
    "Failed query: SELECT * FROM users WHERE user_id = 'abac41e5-uuid-leak'\nparams: abac41e5-uuid-leak",
  );
  const res = internalError("projects", err);

  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: string };
  expect(body.error).toBe("Internal error");
  expect(body.error).not.toContain("Failed query");
  expect(body.error).not.toContain("SELECT");
  expect(body.error).not.toContain("abac41e5");
  expect(body.error).not.toContain("params");
});

test("default mode logs the original error so server-side debugging stays possible", async () => {
  const err = new Error("real cause for the log");
  internalError("task-context", err);

  expect(consoleSpy).toHaveBeenCalledTimes(1);
  const call = consoleSpy.mock.calls[0]!;
  expect(call[0]).toBe("[task-context] error:");
  expect(call[1]).toBe(err);
});

test("VERBOSE mode forwards the raw message — opt-in debug aid only", async () => {
  process.env[ENV_KEY] = "1";
  const err = new Error("Failed query: detailed cause");
  const res = internalError("graph", err);

  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: string };
  expect(body.error).toBe("Failed query: detailed cause");
});

test("VERBOSE flag must be exactly '1' — anything else stays generic", async () => {
  process.env[ENV_KEY] = "true"; // common typo
  const err = new Error("should not leak");
  const res = internalError("projects", err);
  const body = (await res.json()) as { error: string };
  expect(body.error).toBe("Internal error");
});

test("non-Error thrown values still produce a generic response with the label logged", async () => {
  const res = internalError("task", "some-string-thrown");
  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: string };
  expect(body.error).toBe("Internal error");

  expect(consoleSpy).toHaveBeenCalledTimes(1);
  const call = consoleSpy.mock.calls[0]!;
  expect(call[0]).toBe("[task] error:");
  expect(call[1]).toBe("some-string-thrown");
});

test("VERBOSE mode with non-Error throw still returns generic — only Error.message is forwarded", async () => {
  process.env[ENV_KEY] = "1";
  const res = internalError("task", { weird: "object" });
  const body = (await res.json()) as { error: string };
  expect(body.error).toBe("Internal error");
});

test("production NODE_ENV pins verbose to generic even with MYMIR_API_VERBOSE_ERRORS=1", async () => {
  // Defense-in-depth: an operator who accidentally ships
  // MYMIR_API_VERBOSE_ERRORS=1 to production must not leak SQL fragments,
  // bound params, or internal stack traces through 500 response bodies.
  // The env-var check is the documented contract; the NODE_ENV tripwire
  // makes verbose mode physically impossible in prod.
  const originalNodeEnv = process.env.NODE_ENV;
  process.env[ENV_KEY] = "1";
  Object.defineProperty(process.env, "NODE_ENV", {
    value: "production",
    configurable: true,
  });
  try {
    const err = new Error("Failed query: should never reach the client");
    const res = internalError("projects", err);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Internal error");
    expect(body.error).not.toContain("Failed query");
  } finally {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
    });
  }
});
