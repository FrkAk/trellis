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
 * Next.js proxy — session protection + rate limiting + validation.
 * MCP/API auth is handled by JWT verification in route handlers.
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
    pathname === "/consent" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/mcp" ||
    pathname.startsWith("/.well-known/");
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
