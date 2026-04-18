import { auth } from "@/lib/auth";

const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const origin = new URL(baseUrl).origin;

// Intercept the token endpoint to inject the `resource` parameter when absent.
// Without it, Better Auth issues an opaque token. With it, Better Auth issues a JWT.
// This ensures clients like Codex CLI (which don't send `resource`) get a JWT
// that our MCP route can verify directly via JWKS.
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let body: URLSearchParams;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    body = new URLSearchParams(await request.text());
  } else {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  if (!body.has("resource")) {
    body.set("resource", `${origin}/api/mcp`);
  }

  const modified = new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  return auth.handler(modified);
}
