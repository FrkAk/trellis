import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "@/lib/db/auth-schema";

/**
 * Shareable team invite codes — one row per organization in v1.
 *
 * Lives in `public` (drizzle-managed) and references `neon_auth.organization`
 * + `neon_auth.user` via cross-schema FKs. Kept separate from `lib/db/schema.ts`
 * because it's a join concept between the auth and app schemas — same split
 * we already use for `auth-schema.ts` vs `schema.ts`.
 *
 * Distinct from `neon_auth.invitation`: that table is per-recipient-email and
 * Better Auth's `acceptInvitation` enforces `invitation.email === session.user.email`.
 * A team-wide code can't ride that flow without forging email, so we use
 * `auth.api.addMember` against this separate table instead.
 *
 * RLS is enabled with a 1-hop membership predicate. The three invite-code
 * helpers in `lib/data/team-invite-code.ts` use `serviceRoleDb` (BYPASSRLS)
 * because the joining user has no `neon_auth.member` row at the moment of
 * lookup; the remaining helpers (`findTeamInviteCode`, `createTeamInviteCode`,
 * `rotateTeamInviteCode`, `revokeTeamInviteCode`) operate on rows the caller
 * already owns and stay on the RLS-enforced `db` client.
 */
export const teamInviteCodes = pgTable(
  "team_invite_code",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    defaultRole: text("default_role")
      .$type<"member" | "admin">()
      .notNull()
      .default("member"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("team_invite_code_code_idx").on(t.code),
    check(
      "team_invite_code_default_role_check",
      sql`${t.defaultRole} IN ('member', 'admin')`,
    ),
    pgPolicy("team_invite_code_member_access", {
      as: "permissive",
      for: "all",
      to: "public",
      using: sql`EXISTS (
        SELECT 1 FROM neon_auth."member" m
        WHERE m."organizationId" = ${t.organizationId}
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM neon_auth."member" m
        WHERE m."organizationId" = ${t.organizationId}
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      )`,
    }),
  ],
).enableRLS();

export type TeamInviteCode = typeof teamInviteCodes.$inferSelect;
export type NewTeamInviteCode = typeof teamInviteCodes.$inferInsert;
