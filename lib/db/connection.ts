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

// Pool size budget: Cloudflare Workers spawn ~10 concurrent isolates per
// deploy under typical load; each gets its own three pools (app_user,
// auth_role, service_role). Neon Launch tier caps per-branch connections
// at ~100. Budget: 100 ÷ 3 roles ÷ ~10 isolates ≈ 3 conns/role/isolate.
// Bump max if the deploy target has more isolates or a higher Neon tier.

/**
 * Build the application Drizzle client for the active driver.
 *
 * @returns Drizzle instance bound to the public schema.
 * @throws Error when `DATABASE_URL` is unset.
 */
function buildAppDb(): AppDb {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required for the app runtime connection (app_user role).",
    );
  }
  if (isNeon()) {
    const pool = new NeonPool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
    });
    return drizzleNeon(pool, { schema: appSchema }) as unknown as AppDb;
  }
  return drizzlePg(postgres(url, { max: 3, idle_timeout: 10 }), {
    schema: appSchema,
  });
}

/**
 * Build the Better-auth Drizzle client for the active driver.
 *
 * @returns Drizzle instance bound to the neon_auth schema.
 * @throws Error when `DATABASE_AUTH_URL` is unset.
 */
function buildAuthDb(): AuthDb {
  const url = process.env.DATABASE_AUTH_URL;
  if (!url) {
    throw new Error(
      "DATABASE_AUTH_URL is required — Better Auth must connect via auth_role " +
        "(DML on neon_auth.*, no public-schema access).",
    );
  }
  if (isNeon()) {
    const pool = new NeonPool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
    });
    return drizzleNeon(pool, { schema: authSchema }) as unknown as AuthDb;
  }
  return drizzlePg(postgres(url, { max: 3, idle_timeout: 10 }), {
    schema: authSchema,
  });
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
    const pool = new NeonPool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
    });
    return drizzleNeon(pool, { schema: appSchema }) as unknown as AppDb;
  }
  return drizzlePg(postgres(url, { max: 3, idle_timeout: 10 }), {
    schema: appSchema,
  });
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
 * Lazily initialized BYPASSRLS Drizzle client. Used by exactly TWO
 * documented bypass sites:
 *   - `lib/data/account.ts:clearOrgMembershipArtifacts` — cross-schema
 *     cleanup (neon_auth.session/oauth* + public.task_assignees) for a user
 *     just removed from an org.
 *   - `lib/data/project.ts:listOrgProjectIdsAsAdmin` — wraps the
 *     SECURITY DEFINER `public.list_org_project_ids(uuid)`. Used by
 *     `lib/realtime/access.ts:revokeOrgAccess` which runs after the
 *     member row is already gone, so a member-scoped lookup would
 *     return zero rows.
 *
 * The three invite-code helpers (reserveInviteCodeSlot, releaseInviteCodeSlot,
 * diagnoseTeamInviteCode) previously used this client; they have moved to
 * SECURITY DEFINER SQL functions exposed to app_user. Do not add new bypass
 * sites without auditing whether a SECURITY DEFINER function can replace them.
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
