const COMMON_DIRECTIVES = [
  "default-src 'self'",
  // Intentional divergence from Next.js's canonical CSP example
  // (docs/01-app/02-guides/content-security-policy.mdx, May 2026): the docs
  // use `style-src 'self' 'nonce-${nonce}'`, but CSP nonces only cover
  // `<style>` elements, not the `style="..."` attributes this app uses on
  // Avatar, Sidebar, sign-in form, etc. `'unsafe-inline'` is required until
  // those inline style attributes are refactored to class-based styles.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
];

const PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), interest-cohort=()";

const HSTS_VALUE = "max-age=31536000; includeSubDomains";

/**
 * Regex matching loopback Host headers that must NOT receive HSTS.
 *
 * Chrome treats `localhost` as a secure context and honours HSTS received
 * even on `http://localhost`, breaking subsequent local prod-build smoke
 * tests (`bun run build && bun run start`) by auto-upgrading every
 * navigation to `https://localhost`, which has no TLS listener. Extend this
 * regex if you run prod builds against other loopback aliases.
 */
const LOOPBACK_HOST_REGEX = "^(localhost|127\\.0\\.0\\.1|\\[::1\\])(:\\d+)?$";

/** Single header entry, matching the `{ key, value }` shape `next.config.ts` `headers()` expects. */
type HeaderEntry = { key: string; value: string };

/** Single rule entry returned by `next.config.ts` `headers()`. */
export type HeaderRule = {
  source: string;
  headers: HeaderEntry[];
  missing?: Array<{ type: "host"; value: string }>;
};

/**
 * Build the Content-Security-Policy value for a given environment / nonce.
 *
 * Production includes a per-request nonce and `'strict-dynamic'` so the
 * App Router's inline RSC streaming scripts (the `self.__next_f.push(...)`
 * tags Next.js emits during hydration) are trusted while ad-hoc inline
 * injections remain blocked. Dev allows `'unsafe-eval'` + `'unsafe-inline'`
 * and `ws:`/`wss:` to keep HMR working.
 *
 * @param opts.isProd - True when running in production.
 * @param opts.nonce - Per-request nonce. Required when `isProd` is true.
 * @returns Header value string suitable for the `Content-Security-Policy` header.
 * @throws If `isProd` is true and no `nonce` is supplied.
 */
export function buildCsp(opts: { isProd: boolean; nonce?: string }): string {
  const { isProd, nonce } = opts;

  let scriptSrc: string;
  let connectSrc: string;
  let workerSrc: string;

  if (isProd) {
    if (!nonce) {
      throw new Error("buildCsp: nonce is required in production");
    }
    scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
    connectSrc = "connect-src 'self'";
    workerSrc = "worker-src 'self'";
  } else {
    scriptSrc = "script-src 'self' 'unsafe-eval' 'unsafe-inline'";
    connectSrc = "connect-src 'self' ws: wss:";
    workerSrc = "worker-src 'self' blob:";
  }

  const directives = [...COMMON_DIRECTIVES, scriptSrc, connectSrc, workerSrc];
  if (isProd) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/**
 * Always-on security response headers Next.js emits on every route.
 *
 * Excludes CSP (emitted per-request by `middleware.ts` with a nonce) and
 * HSTS (host-scoped via `headerRules`).
 *
 * @returns Array of `{ key, value }` entries suitable for a Next.js header rule.
 */
export function securityHeaders(): HeaderEntry[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  ];
}

/**
 * Build the full set of Next.js header rules: always-on security headers
 * plus a host-scoped HSTS rule that skips loopback hosts.
 *
 * HSTS is emitted only in production AND only for non-loopback hosts, so
 * deployed environments (Cloudflare, self-hosted on a real domain) receive
 * HSTS while local `bun run start` smoke tests do not poison the browser
 * cache.
 *
 * @param isProd - True when `NODE_ENV === 'production'`.
 * @returns Array of header rules suitable for `next.config.ts` `headers()`.
 */
export function headerRules(isProd: boolean): HeaderRule[] {
  const rules: HeaderRule[] = [
    { source: "/:path*", headers: securityHeaders() },
  ];

  if (isProd) {
    rules.push({
      source: "/:path*",
      missing: [{ type: "host", value: LOOPBACK_HOST_REGEX }],
      headers: [{ key: "Strict-Transport-Security", value: HSTS_VALUE }],
    });
  }

  return rules;
}
