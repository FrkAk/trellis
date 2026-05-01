"use client";

import { useState, useTransition } from "react";
import { acceptInvitation, createTeam } from "./actions";

/**
 * Onboarding form — lets the signed-in user create a new team or accept an
 * invitation by id. Both branches dispatch to server actions in `./actions.ts`,
 * which call Better Auth's organization API and `setActiveOrganization`.
 */
export function OnboardingForm() {
  const [tab, setTab] = useState<"create" | "join">("create");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border-strong/60 bg-surface-raised/40 p-5">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === "create" ? "bg-accent text-text-primary" : "text-text-muted"}`}
          onClick={() => {
            setTab("create");
            setError(null);
          }}
        >
          Create team
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === "join" ? "bg-accent text-text-primary" : "text-text-muted"}`}
          onClick={() => {
            setTab("join");
            setError(null);
          }}
        >
          Accept invitation
        </button>
      </div>

      {tab === "create" ? (
        <form
          action={(formData) => {
            const name = String(formData.get("name") ?? "");
            const slug = String(formData.get("slug") ?? "");
            startTransition(async () => {
              const result = await createTeam({ name, slug });
              if (!result.ok) setError(result.message);
            });
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            <span className="mb-1 block text-text-secondary">Team name</span>
            <input
              name="name"
              required
              maxLength={64}
              placeholder="Acme Robotics"
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-text-secondary">URL slug</span>
            <input
              name="slug"
              required
              minLength={2}
              maxLength={32}
              pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
              placeholder="acme-robotics"
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-mono text-text-primary"
            />
            <span className="mt-1 block text-xs text-text-muted">
              Lowercase letters, digits, hyphens. 2–32 characters.
            </span>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-text-primary disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create team"}
          </button>
        </form>
      ) : (
        <form
          action={(formData) => {
            const invitationId = String(formData.get("invitationId") ?? "");
            startTransition(async () => {
              const result = await acceptInvitation({ invitationId });
              if (!result.ok) setError(result.message);
            });
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            <span className="mb-1 block text-text-secondary">Invitation id</span>
            <input
              name="invitationId"
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-mono text-text-primary"
            />
            <span className="mt-1 block text-xs text-text-muted">
              Ask the team owner for the invitation id (UUID).
            </span>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-text-primary disabled:opacity-60"
          >
            {pending ? "Joining…" : "Accept invitation"}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
