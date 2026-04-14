import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import {
  matchRule,
  extractKey,
  rateLimitHeaders,
  getBackend,
} from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Constant-time string comparison via SHA-256 hashing.
 * Always performs both hashes regardless of input length to avoid leaking
 * length information. Works on both Bun and CF Workers.
 * @param a - First string.
 * @param b - Second string.
 * @returns true if strings are equal.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  const lenMatch = aBuf.byteLength === bBuf.byteLength ? 0 : 1;
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", aBuf),
    crypto.subtle.digest("SHA-256", bBuf),
  ]);
  const aArr = new Uint8Array(aHash);
  const bArr = new Uint8Array(bHash);
  let diff = lenMatch;
  for (let i = 0; i < aArr.length; i++) diff |= aArr[i]! ^ bArr[i]!;
  return diff === 0;
}

/**
 * Check Bearer token auth for protected API routes.
 * Returns null if authorized, or a 401 response if not.
 * Bypasses: dev mode (no key set), localhost, same-origin browser requests.
 * @param request - Incoming request.
 * @returns 401 response or null (authorized).
 */
async function checkAuth(request: NextRequest): Promise<NextResponse | null> {
  const apiKey = process.env.MYMIR_API_KEY;
  if (!apiKey) return null;

  const host = request.headers.get("host") ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1"))
    return null;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return null;

  const auth = request.headers.get("authorization");
  if (auth && (await timingSafeEqual(auth, `Bearer ${apiKey}`))) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Next.js proxy — session protection + API key auth + rate limiting + validation.
 * @param request - Incoming request.
 * @returns Redirect, error response, or pass-through.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = getSessionCookie(request);

  // Auth pages: redirect to home if already signed in
  if (session && (pathname === "/sign-in" || pathname === "/sign-up")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Protected app pages: redirect to sign-in if not authenticated.
  // Only auth endpoints and MCP routes are public — all other API
  // routes require a session cookie to prevent unauthenticated access.
  const isPublicPath =
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/mymir/") ||
    pathname === "/api/mcp" ||
    pathname === "/api/test-connection";
  if (!session && !isPublicPath) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
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
          return NextResponse.json(
            { error: "Too many requests. Please try again later." },
            { status: 429, headers: rlHeaders },
          );
        }
      }
    }
  }

  // MCP API key auth
  if (pathname.startsWith("/api/mymir/") || pathname === "/api/mcp") {
    const authError = await checkAuth(request);
    if (authError) return authError;
  }

  // UUID validation for project routes
  const match = pathname.match(/^\/api\/project\/([^/]+)/);
  if (match && !UUID_RE.test(match[1])) {
    return NextResponse.json(
      { error: "Invalid project ID" },
      { status: 400 },
    );
  }

  const response = NextResponse.next();
  if (rlHeaders) {
    for (const [k, v] of Object.entries(rlHeaders)) {
      response.headers.set(k, v);
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)"],
};
