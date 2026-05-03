"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/shared/Button";
import { TabSwitcher } from "@/components/shared/TabSwitcher";
import {
  INVITE_CODE_ALPHABET_PATTERN_SOURCE,
  INVITE_CODE_LENGTH,
} from "@/lib/auth/invite-code-shape";
import { acceptInviteCode, createTeam } from "./actions";

const INVITE_CODE_HTML_PATTERN = `${INVITE_CODE_ALPHABET_PATTERN_SOURCE}{${INVITE_CODE_LENGTH}}`;
const INVITE_CODE_PLACEHOLDER = "8K3jH-pX9_aW2nQ7vB4mF";

/** Personalize the team-name placeholder using the caller's first name. */
function teamNamePlaceholder(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${first}'s Team` : "My Team";
}

/** Slug placeholder mirrors the team-name placeholder, lowercased and hyphenated. */
function slugPlaceholder(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0]?.toLowerCase();
  return first ? `${first}-team` : "my-team";
}

const INPUT_CLASS =
  "w-full rounded-lg border border-border-strong bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent";

const LABEL_CLASS = "mb-1 block text-xs font-medium text-text-secondary";

const HELP_CLASS = "mt-1 block text-xs text-text-muted";

const TABS = [
  { id: "create", label: "Create team" },
  { id: "join", label: "Join with code" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface OnboardingFormProps {
  /** Caller's display name — first word becomes "{name}'s Team" placeholder. */
  userName?: string | null;
}

/**
 * Onboarding form — lets the signed-in user create a new team or join an
 * existing one with a 21-char invite code. Both branches dispatch to
 * server actions in `./actions.ts` which delegate to `lib/actions/team.ts`
 * and `lib/actions/team-invite-code.ts`.
 * @param props - Optional caller display name for personalized placeholders.
 * @returns Card-shaped form panel with create/join tabs.
 */
export function OnboardingForm({ userName }: OnboardingFormProps = {}) {
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
              placeholder={teamNamePlaceholder(userName)}
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
              placeholder={slugPlaceholder(userName)}
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
            const code = String(formData.get("code") ?? "");
            startTransition(async () => {
              const result = await acceptInviteCode({ code });
              if (!result.ok) setError(result.message);
            });
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className={LABEL_CLASS}>Invite code</span>
            <input
              name="code"
              required
              minLength={INVITE_CODE_LENGTH}
              maxLength={INVITE_CODE_LENGTH}
              pattern={INVITE_CODE_HTML_PATTERN}
              autoComplete="off"
              spellCheck={false}
              placeholder={INVITE_CODE_PLACEHOLDER}
              className={`${INPUT_CLASS} font-mono tracking-wider`}
            />
            <span className={HELP_CLASS}>
              Paste the 21-character invite code your team admin shared.
            </span>
          </label>
          <Button
            type="submit"
            variant="primary"
            isLoading={pending}
            className="w-full"
          >
            Join team
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
