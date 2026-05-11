"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { formatOAuthClientName } from "@/lib/ui/oauth-client-name";

/**
 * Read the deployment host on the client without breaking hydration. The
 * server has no `window`, so the server snapshot is `null` and the
 * post-hydration re-render fills in the real host.
 */
function subscribeNoop(): () => void {
  return () => {};
}
function getOwnHostClient(): string | null {
  return window.location.host;
}
function getOwnHostServer(): string | null {
  return null;
}

/**
 * Hosts trusted as redirect targets without warning the user. Localhost
 * variants cover the dev experience for MCP CLIs that round-trip a code
 * through a loopback listener.
 */
const SAFE_REDIRECT_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Custom URL schemes used by legitimate MCP CLIs that round-trip the
 * authorization code through the operating system's URL handler instead of
 * a loopback HTTP server.
 */
const SAFE_REDIRECT_SCHEMES = new Set(["vscode:", "cursor:", "claude:"]);

type ConsentMeta = {
  client_id: string;
  client_name: string;
  client_uri?: string;
  logo_uri?: string;
  tos_uri?: string;
  policy_uri?: string;
  isFirstTime: boolean;
};

/**
 * Result of evaluating the OAuth `redirect_uri` against the safe-redirect
 * allowlist. Carries the user-facing host string so the page renders the
 * same value in both the "Redirecting to" row and the warning banner.
 */
type RedirectEvaluation = {
  safe: boolean;
  display: string;
};

/**
 * Decide whether a `redirect_uri` is on the safe-redirect allowlist and
 * compute the user-facing host label. An `ownHost` of `null` (SSR) treats
 * the deployment host as unknown so the same-host fast path falls through
 * to the hostname allowlist check.
 *
 * @param redirectUri - The `redirect_uri` from the signed authorize query.
 * @param ownHost - The deployment host or `null` when not yet hydrated.
 * @returns Verdict + display string. Unparseable URIs fail closed.
 */
function evaluateRedirect(
  redirectUri: string | null,
  ownHost: string | null,
): RedirectEvaluation {
  if (!redirectUri) return { safe: false, display: "(missing)" };
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return { safe: false, display: redirectUri };
  }
  if (SAFE_REDIRECT_SCHEMES.has(parsed.protocol)) {
    return { safe: true, display: redirectUri };
  }
  const host = parsed.host;
  const hostname = parsed.hostname;
  if (SAFE_REDIRECT_HOSTS.has(hostname) || (ownHost && host === ownHost)) {
    return { safe: true, display: host };
  }
  return { safe: false, display: host || redirectUri };
}

/**
 * OAuth consent page — approve or deny an MCP client's access request.
 * Redirected here by the OAuth authorization endpoint with signed query
 * params. Requires an active session (BA's consent action is session-gated).
 *
 * Renders an identity-aware view: brand-normalized client name, the host of
 * the actual redirect_uri, a first-time / unsafe-redirect warning banner,
 * and the raw client_id demoted to a muted footnote.
 *
 * @returns Consent form with approve/deny buttons.
 */
export default function ConsentPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const scope = searchParams.get("scope");

  const [meta, setMeta] = useState<ConsentMeta | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const missingClientId = !clientId;
  const metaError = missingClientId
    ? "Missing client_id in the authorization request."
    : fetchError;

  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    fetch(
      `/api/oauth/consent-meta?client_id=${encodeURIComponent(clientId)}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) {
          setFetchError(
            res.status === 404
              ? "This application is no longer registered."
              : "Could not load application details.",
          );
          return;
        }
        setMeta((await res.json()) as ConsentMeta);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setFetchError("Could not load application details.");
      });
    return () => controller.abort();
  }, [clientId]);

  const ownHost = useSyncExternalStore(
    subscribeNoop,
    getOwnHostClient,
    getOwnHostServer,
  );

  const redirect = useMemo(
    () => evaluateRedirect(redirectUri, ownHost),
    [redirectUri, ownHost],
  );

  /**
   * Submit consent decision to the OAuth provider.
   *
   * @param accept - Whether the user approved access.
   */
  async function handleConsent(accept: boolean) {
    setError("");
    setSubmitting(true);

    try {
      const res = await authClient.oauth2.consent({
        accept,
        oauth_query: window.location.search.slice(1),
      });

      if (res.data?.url) {
        const isHttp = /^https?:/i.test(res.data.url);
        window.location.href = res.data.url;
        if (!isHttp) {
          setDone(true);
          setSubmitting(false);
        }
        return;
      }

      if (res.error) {
        setError(res.error.message ?? "Consent failed");
        setSubmitting(false);
      }
    } catch {
      setError("Something went wrong");
      setSubmitting(false);
    }
  }

  const scopes = scope?.split(" ").filter(Boolean) ?? [];

  if (done) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-semibold text-text-primary">
            Authorization sent
          </h1>
          <p className="text-sm text-text-muted">
            Return to your application to finish signing in. You can close
            this tab.
          </p>
        </div>
      </div>
    );
  }

  const brandName = meta ? formatOAuthClientName(meta.client_name) : "";
  const initial = brandName.charAt(0).toUpperCase() || "?";

  const warnings: string[] = [];
  if (meta) {
    if (!meta.logo_uri || !meta.client_uri) {
      warnings.push("This app has not published a website or logo.");
    }
    if (meta.isFirstTime) {
      warnings.push("This is the first time you are approving this app.");
    }
  }
  if (!redirect.safe) {
    warnings.push(`Redirecting to an unverified destination: ${redirect.display}.`);
  }

  const approveDisabled = submitting || (!meta && !metaError);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-base font-semibold text-accent"
          >
            {initial}
          </div>
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold text-text-primary">
              {meta ? brandName : metaError ? "Authorize access" : "…"}
            </h1>
            <p className="text-sm text-text-muted">
              wants to access your Mymir account.
            </p>
          </div>
        </div>

        {metaError && (
          <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
            {metaError}
          </div>
        )}

        <div className="space-y-3">
          <div className="rounded-md border border-border-strong bg-surface p-3">
            <p className="text-xs font-medium text-text-secondary">
              Redirecting to
            </p>
            <p className="text-sm font-mono text-text-primary break-all">
              {redirect.display}
            </p>
          </div>

          {meta && (meta.client_uri || meta.tos_uri || meta.policy_uri) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs">
              {meta.client_uri && (
                <a
                  href={meta.client_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Website
                </a>
              )}
              {meta.tos_uri && (
                <a
                  href={meta.tos_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Terms
                </a>
              )}
              {meta.policy_uri && (
                <a
                  href={meta.policy_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Privacy
                </a>
              )}
            </div>
          )}

          {scopes.length > 0 && (
            <div className="rounded-md border border-border-strong bg-surface p-3 space-y-2">
              <p className="text-xs font-medium text-text-secondary">
                Requested permissions
              </p>
              <ul className="space-y-1">
                {scopes.map((s) => (
                  <li
                    key={s}
                    className="text-sm text-text-primary flex items-center gap-2"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div
              className="rounded-md border border-progress/25 bg-progress/10 p-3 text-xs text-progress space-y-1"
              role="alert"
            >
              {warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              <p className="text-text-muted">
                Verify it is the one you started signing into.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleConsent(false)}
              className="flex-1 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Deny
            </button>
            <button
              type="button"
              disabled={approveDisabled}
              onClick={() => handleConsent(true)}
              className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-1">
                  <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
                </span>
              ) : (
                "Approve"
              )}
            </button>
          </div>

          {clientId && (
            <p className="text-center text-[10px] font-mono text-text-muted break-all">
              client_id: {clientId}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
