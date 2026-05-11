import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import {
  matchRule,
  extractKey,
  rateLimitHeaders,
  getBackend,
} from "@/lib/api/rate-limit";
import { buildCsp } from "@/lib/security/headers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generate a cryptographically random per-request CSP nonce.
 *
 * Matches the Next.js 16 docs pattern verbatim
 * (docs/01-app/02-guides/content-security-policy.mdx, May 2026) so future
 * readers can cross-reference. UUID v4 supplies 122 bits of randomness,
 * comfortably above the ~64 bits CSP nonces are expected to carry.
 *
 * @returns Base64-encoded UUID v4.
 */
function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/**
 * Next.js proxy — session protection + rate limiting + validation + CSP.
 * MCP/API auth is handled by JWT verification in route handlers.
 *
 * CSP is emitted here (not via `next.config.ts` `headers()`) because the
 * App Router's inline RSC hydration scripts require a per-request nonce.
 *
 * @param request - Incoming request.
 * @returns Redirect, error response, or pass-through, all carrying CSP.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = getSessionCookie(request);

  const isProd = process.env.NODE_ENV === "production";
  const nonce = isProd ? generateNonce() : undefined;
  const csp = buildCsp({ isProd, nonce });
  const withCsp = <T extends NextResponse>(response: T): T => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  // Auth pages: redirect to home if already signed in
  if (session && (pathname === "/sign-in" || pathname === "/sign-up")) {
    return withCsp(NextResponse.redirect(new URL("/", request.url)));
  }

  // Protected app pages: redirect to sign-in if not authenticated.
  // Only auth endpoints and MCP routes are public — all other API
  // routes require a session cookie to prevent unauthenticated access.
  const isPublicPath =
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname === "/consent" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/mcp" ||
    pathname.startsWith("/.well-known/");
  if (!session && !isPublicPath) {
    return withCsp(NextResponse.redirect(new URL("/sign-in", request.url)));
  }

  // Rate limiting — runs before auth so brute-force attempts are throttled
  let rlHeaders: Record<string, string> | null = null;
  if (!pathname.startsWith("/api/auth/")) {
    const rule = matchRule(pathname);
    if (rule) {
      const key = await extractKey(request, rule.keyStrategy);
      if (key) {
        const result = await getBackend().check(
          `${rule.pattern}:${key}`,
          rule.max,
          rule.window,
        );
        rlHeaders = rateLimitHeaders(result, rule);
        if (!result.allowed) {
          return withCsp(
            NextResponse.json(
              { error: "Too many requests. Please try again later." },
              { status: 429, headers: rlHeaders },
            ),
          );
        }
      }
    }
  }

  // UUID validation for project routes
  const match = pathname.match(/^\/api\/project\/([^/]+)/);
  if (match && !UUID_RE.test(match[1])) {
    return withCsp(
      NextResponse.json({ error: "Invalid project ID" }, { status: 400 }),
    );
  }

  // Forward both `x-nonce` and the CSP on the request headers so Next.js's
  // renderer reads the full policy and auto-tags every emitted <script>.
  // Matches docs/01-app/02-guides/content-security-policy.mdx (May 2026).
  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (rlHeaders) {
    for (const [k, v] of Object.entries(rlHeaders)) {
      response.headers.set(k, v);
    }
  }
  return withCsp(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)"],
};
