import "server-only";

import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as NeonPool } from "@neondatabase/serverless";
import postgres from "postgres";
import * as appSchema from "./schema";
import * as authSchema from "./auth-schema";

/**
 * Drizzle clients for both drivers conform to the same `PgDatabase` interface
 * but their `ReturnType<>` aliases diverge in method overloads (notably
 * `.returning({...})` and `.delete(...).returning()`), so unioning them
 * produces a method set TypeScript can't pick a callable signature from.
 *
 * Pin the alias to the postgres-js shape — the dev/self-host default — and
 * cast the neon-built instance via `as unknown as AppDb`. Driver shape
 * differences inside `client.execute()` are normalized by `executeRaw` in
 * `./raw.ts`, so the cast is sound at runtime.
 */
type AppDb = ReturnType<typeof drizzlePg<typeof appSchema>>;
type AuthDb = ReturnType<typeof drizzlePg<typeof authSchema>>;

declare global {
  var __mymirAppDb: AppDb | undefined;
  var __mymirAuthDb: AuthDb | undefined;
  var __mymirServiceRoleDb: AppDb | undefined;
}

const isNeon = (): boolean => process.env.MYMIR_DB_DRIVER === "neon";

/**
 * Build the application Drizzle client for the active driver.
 *
 * @returns Drizzle instance bound to the public schema.
 */
function buildAppDb(): AppDb {
  const url = process.env.DATABASE_URL!;
  if (isNeon()) {
    const pool = new NeonPool({ connectionString: url });
    return drizzleNeon(pool, { schema: appSchema }) as unknown as AppDb;
  }
  return drizzlePg(postgres(url), { schema: appSchema });
}

/**
 * Build the Better-auth Drizzle client for the active driver.
 *
 * @returns Drizzle instance bound to the neon_auth schema.
 */
function buildAuthDb(): AuthDb {
  const url = process.env.DATABASE_URL!;
  if (isNeon()) {
    const pool = new NeonPool({ connectionString: url });
    return drizzleNeon(pool, { schema: authSchema }) as unknown as AuthDb;
  }
  return drizzlePg(postgres(url), { schema: authSchema });
}

/**
 * Build the BYPASSRLS Drizzle client for the active driver. Wired against
 * `DATABASE_SERVICE_ROLE_URL` — a separate connection string for a role with
 * BYPASSRLS (Neon `service_role` in prod, `service_role` in self-host).
 *
 * @returns Drizzle instance bound to the public schema.
 * @throws Error when `DATABASE_SERVICE_ROLE_URL` is unset.
 */
function buildServiceRoleDb(): AppDb {
  const url = process.env.DATABASE_SERVICE_ROLE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_SERVICE_ROLE_URL is required for service-role data access",
    );
  }
  if (isNeon()) {
    const pool = new NeonPool({ connectionString: url });
    return drizzleNeon(pool, { schema: appSchema }) as unknown as AppDb;
  }
  return drizzlePg(postgres(url), { schema: appSchema });
}

/**
 * Lazily initialized application Drizzle client.
 *
 * Driver chosen at first access via `MYMIR_DB_DRIVER`:
 * - `neon` → `drizzle-orm/neon-serverless` + WebSocket `Pool`
 * - unset / anything else → `drizzle-orm/postgres-js` + `postgres` TCP
 *
 * Cached on `globalThis` so warm Workers isolates reuse the connection
 * across requests instead of paying the WebSocket handshake each time.
 */
export const appDb = new Proxy({} as AppDb, {
  get(_target, prop, receiver) {
    if (!globalThis.__mymirAppDb) globalThis.__mymirAppDb = buildAppDb();
    return Reflect.get(globalThis.__mymirAppDb, prop, receiver);
  },
});

/**
 * Lazily initialized Better-auth Drizzle client.
 *
 * Same driver-selection and caching semantics as {@link appDb} but bound
 * to the `neon_auth` schema used by `drizzleAdapter` in {@link auth}.
 */
export const authDb = new Proxy({} as AuthDb, {
  get(_target, prop, receiver) {
    if (!globalThis.__mymirAuthDb) globalThis.__mymirAuthDb = buildAuthDb();
    return Reflect.get(globalThis.__mymirAuthDb, prop, receiver);
  },
});

/**
 * Lazily initialized BYPASSRLS Drizzle client. Used by the four documented
 * RLS bypass sites in the data ring:
 *   - `lib/data/team-invite-code.ts:reserveInviteCodeSlot` — joining user has
 *     no `neon_auth.member` row yet, so `withUserContext` would default-deny.
 *   - `lib/data/team-invite-code.ts:releaseInviteCodeSlot` — saga compensation
 *     for the reservation; bypass must match reserve.
 *   - `lib/data/team-invite-code.ts:diagnoseTeamInviteCode` — ops triage
 *     follows the same lookup path; consistent bypass surface.
 *   - `lib/data/account.ts:clearOrgMembershipArtifacts` — cleans up artifacts
 *     for a user JUST REMOVED from an org; the membership predicate would
 *     return zero rows for `task_assignees` DELETE.
 *
 * Any future bypass site MUST be added to this list and documented inline.
 *
 * Same lazy-init + globalThis caching semantics as {@link appDb}.
 */
export const serviceRoleDb = new Proxy({} as AppDb, {
  get(_target, prop, receiver) {
    if (!globalThis.__mymirServiceRoleDb) {
      globalThis.__mymirServiceRoleDb = buildServiceRoleDb();
    }
    return Reflect.get(globalThis.__mymirServiceRoleDb, prop, receiver);
  },
});
