"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * OAuth consent page — approve or deny an MCP client's access request.
 * Redirected here by the OAuth authorization endpoint with signed query params.
 * Requires an active session (enforced by sessionMiddleware on the consent endpoint).
 * @returns Consent form with approve/deny buttons.
 */
export default function ConsentPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id");
  const scope = searchParams.get("scope");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  /**
   * Submit consent decision to the OAuth provider.
   * @param accept - Whether the user approved access.
   */
  async function handleConsent(accept: boolean) {
    setError("");
    setLoading(true);

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
          setLoading(false);
        }
        return;
      }

      if (res.error) {
        setError(res.error.message ?? "Consent failed");
        setLoading(false);
      }
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  const scopes = scope?.split(" ").filter(Boolean) ?? [];

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold text-text-primary">
          Authorization sent
        </h1>
        <p className="text-sm text-text-muted">
          Return to your application to finish signing in. You can close this tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-semibold text-text-primary">
          Authorize access
        </h1>
        <p className="text-sm text-text-muted">
          An application is requesting access to your Mymir account.
        </p>
      </div>

      <div className="space-y-4">
        {clientId && (
          <div className="rounded-md border border-border-strong bg-surface p-3">
            <p className="text-xs font-medium text-text-secondary">
              Application
            </p>
            <p className="text-sm text-text-primary font-mono">{clientId}</p>
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

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleConsent(false)}
            className="flex-1 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Deny
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleConsent(true)}
            className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
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
      </div>
    </div>
  );
}
