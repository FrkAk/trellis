import { test, expect } from "bun:test";
import { securityHeaders } from "@/lib/security/headers";
import nextConfig from "@/next.config";

const REQUIRED_KEYS = [
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Resource-Policy",
];

test("securityHeaders(true) emits every required key in production", () => {
  const headers = securityHeaders(true);
  const keys = headers.map((h) => h.key);
  for (const key of REQUIRED_KEYS) expect(keys).toContain(key);
  expect(keys).toContain("Strict-Transport-Security");
});

test("HSTS is omitted outside production", () => {
  const keys = securityHeaders(false).map((h) => h.key);
  expect(keys).not.toContain("Strict-Transport-Security");
});

test("HSTS uses max-age >= 31536000 with includeSubDomains", () => {
  const hsts = securityHeaders(true).find(
    (h) => h.key === "Strict-Transport-Security",
  );
  expect(hsts).toBeTruthy();
  const m = hsts!.value.match(/max-age=(\d+)/);
  expect(m).toBeTruthy();
  expect(Number(m![1])).toBeGreaterThanOrEqual(31536000);
  expect(hsts!.value).toContain("includeSubDomains");
});

test("production CSP forbids 'unsafe-inline' and 'unsafe-eval' in script-src", () => {
  const csp = securityHeaders(true).find(
    (h) => h.key === "Content-Security-Policy",
  )!.value;
  const scriptSrc = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("script-src"))!;
  expect(scriptSrc).toBe("script-src 'self'");
});

test("CSP includes connect-src 'self' for same-origin SSE (/api/events)", () => {
  const csp = securityHeaders(true).find(
    (h) => h.key === "Content-Security-Policy",
  )!.value;
  expect(csp).toMatch(/connect-src[^;]*\bself\b/);
});

test("CSP includes frame-ancestors 'none' (clickjacking)", () => {
  const csp = securityHeaders(true).find(
    (h) => h.key === "Content-Security-Policy",
  )!.value;
  expect(csp).toMatch(/frame-ancestors[^;]*'none'/);
});

test("nextConfig disables X-Powered-By", () => {
  expect(nextConfig.poweredByHeader).toBe(false);
});

test("nextConfig.headers() applies securityHeaders to /:path*", async () => {
  const rules = await nextConfig.headers!();
  expect(rules).toHaveLength(1);
  expect(rules[0]!.source).toBe("/:path*");
  const keys = rules[0]!.headers.map((h) => h.key);
  for (const key of REQUIRED_KEYS) expect(keys).toContain(key);
});
