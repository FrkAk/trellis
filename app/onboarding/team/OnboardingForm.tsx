"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/shared/Button";
import { TabSwitcher } from "@/components/shared/TabSwitcher";
import { acceptInvitation, createTeam } from "./actions";

const INPUT_CLASS =
  "w-full rounded-lg border border-border-strong bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent";

const LABEL_CLASS = "mb-1 block text-xs font-medium text-text-secondary";

const HELP_CLASS = "mt-1 block text-xs text-text-muted";

const TABS = [
  { id: "create", label: "Create team" },
  { id: "join", label: "Accept invitation" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Onboarding form — lets the signed-in user create a new team or accept an
 * invitation by id. Both branches dispatch to server actions in `./actions.ts`,
 * which call Better Auth's organization API and `setActiveOrganization`.
 * @returns Card-shaped form panel with create/join tabs.
 */
export function OnboardingForm() {
  const [tab, setTab] = useState<TabId>("create");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * Switch tabs and clear any stale error from the previous tab.
   * @param next - Tab id to activate.
   */
  function handleTabChange(next: string) {
    setTab(next as TabId);
    setError(null);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <TabSwitcher
        tabs={[...TABS]}
        activeTab={tab}
        onTabChange={handleTabChange}
        stretch
        className="mb-5"
      />

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
          className="space-y-4"
        >
          <label className="block">
            <span className={LABEL_CLASS}>Team name</span>
            <input
              name="name"
              required
              maxLength={64}
              placeholder="Acme Robotics"
              className={INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>URL slug</span>
            <input
              name="slug"
              required
              minLength={2}
              maxLength={32}
              pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
              placeholder="acme-robotics"
              className={`${INPUT_CLASS} font-mono`}
            />
            <span className={HELP_CLASS}>
              Lowercase letters, digits, hyphens. 2–32 characters.
            </span>
          </label>
          <Button
            type="submit"
            variant="primary"
            isLoading={pending}
            className="w-full"
          >
            Create team
          </Button>
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
          className="space-y-4"
        >
          <label className="block">
            <span className={LABEL_CLASS}>Invitation id</span>
            <input
              name="invitationId"
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              className={`${INPUT_CLASS} font-mono`}
            />
            <span className={HELP_CLASS}>
              Ask the team owner for the invitation id (UUID).
            </span>
          </label>
          <Button
            type="submit"
            variant="primary"
            isLoading={pending}
            className="w-full"
          >
            Accept invitation
          </Button>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
