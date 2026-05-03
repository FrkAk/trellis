/**
 * Shared slug rules for team URLs. Used by both the server action
 * (Zod validation in `lib/actions/team.ts`) and client-side slug
 * derivation in `app/settings/_components/CreateTeamPanel.tsx`.
 *
 * Server is the source of truth; the client copy short-circuits the
 * obvious bad inputs to avoid a needless round-trip.
 *
 * Pure-data module with no side effects — safe to bundle for the
 * browser.
 */

/** Maximum length of a free-form team display name. */
export const TEAM_NAME_MAX = 64;

/** Maximum length of a team URL slug. */
export const SLUG_MAX = 32;

/** Minimum length of a team URL slug. */
export const SLUG_MIN = 2;

/** Allowed slug shape: lowercase alphanumeric with internal hyphens. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Slugs that resemble route segments or admin-shaped paths. We don't
 * route teams under `/<slug>/...` today, but reserving these now keeps
 * the URL namespace open for future product surfaces (settings panels,
 * admin tools, public landing pages) without a migration later.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "_next",
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "consent",
  "dev",
  "favicon",
  "help",
  "invite",
  "join",
  "login",
  "logout",
  "mcp",
  "onboarding",
  "public",
  "robots",
  "settings",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "sitemap",
  "static",
  "support",
  "team",
  "teams",
  "user",
  "users",
]);
