/**
 * Compare a request's `If-Modified-Since` validator against a server-side
 * `lastModified`. HTTP-date headers carry one-second resolution while
 * Postgres `timestamptz` carries microseconds, so both sides are floored
 * to whole seconds — a round-trip through `toUTCString()` would otherwise
 * produce spurious 200s on otherwise-fresh resources.
 *
 * @param req - Incoming request (Web Request or NextRequest).
 * @param lastModified - Server-side max `updatedAt` for the resource.
 * @returns True when the client's cached validator is at or after
 *   `lastModified` (i.e. the response can be a 304); false otherwise.
 */
export function isNotModified(req: Request, lastModified: Date): boolean {
  const ifModifiedSince = req.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;
  const since = new Date(ifModifiedSince).getTime();
  if (!Number.isFinite(since)) return false;
  return Math.floor(lastModified.getTime() / 1000) <= Math.floor(since / 1000);
}

/**
 * Shared response headers — `private` keeps the payload off shared caches,
 * `no-cache` instructs the browser to always revalidate with the server
 * (an `If-Modified-Since` request) before reusing the cached response.
 * Together they make the conditional-GET contract explicit instead of
 * relying on browser heuristic freshness.
 */
const CACHE_HEADERS = { "Cache-Control": "private, no-cache" } as const;

/**
 * Build a 200 / 304 response based on `If-Modified-Since` semantics
 * (RFC 7232). Sets `Last-Modified` and `Cache-Control` on every response
 * so the client can cache the validator and present it on the next
 * request.
 *
 * @param req - Incoming request (Web Request or NextRequest).
 * @param body - Response body for the 200 path. Pass `null` for HEAD.
 * @param lastModified - Server-side max `updatedAt` for the resource.
 * @returns 304 with no body when {@link isNotModified} is true; otherwise
 *   200 with the body. HEAD always returns a null body regardless of the
 *   200/304 branch.
 */
export function conditionalRespond<T>(
  req: Request,
  body: T,
  lastModified: Date,
): Response {
  const lm = lastModified.toUTCString();
  const baseHeaders = { "Last-Modified": lm, ...CACHE_HEADERS };

  if (isNotModified(req, lastModified)) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  if (req.method === "HEAD") {
    return new Response(null, { status: 200, headers: baseHeaders });
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...baseHeaders, "Content-Type": "application/json" },
  });
}
