import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check Bearer token auth for protected API routes.
 * Returns null if authorized, or a 401 response if not.
 * Bypasses: dev mode (no key set), localhost, same-origin browser requests.
 * @param request - Incoming request.
 * @returns 401 response or null (authorized).
 */
function checkAuth(request: NextRequest): NextResponse | null {
  const apiKey = process.env.MYMIR_API_KEY;
  if (!apiKey) return null;

  const host = request.headers.get("host") ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1"))
    return null;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return null;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${apiKey}`) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Next.js proxy — auth + validation for API routes.
 * @param request - Incoming request.
 * @returns Error response or pass-through.
 */
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/mymir/") || pathname.startsWith("/api/mcp")) {
    const authError = checkAuth(request);
    if (authError) return authError;
  }

  const match = pathname.match(/^\/api\/project\/([^/]+)/);
  if (match && !UUID_RE.test(match[1])) {
    return NextResponse.json(
      { error: "Invalid project ID" },
      { status: 400 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/project/:projectId*",
    "/api/mymir/:tool*",
    "/api/mcp",
  ],
};
