import "server-only";

import { appDb, serviceRoleDb as _serviceRoleDb } from "./connection";

/**
 * Application Drizzle client.
 *
 * @see ./connection.ts for driver selection and lazy-init details.
 */
export const db = appDb;

/**
 * BYPASSRLS Drizzle client. Used by exactly one documented RLS bypass site
 * in the data ring (`clearOrgMembershipArtifacts`). Wired against
 * `DATABASE_SERVICE_ROLE_URL`.
 *
 * @see ./connection.ts for the canonical bypass-site inventory.
 */
export const serviceRoleDb = _serviceRoleDb;

/**
 * A drizzle client or a transaction handle. Re-exported here so the
 * `lib/data/` ring imports both `db` and `Conn` from a single module.
 *
 * @see ./raw.ts for the canonical definition.
 */
export type { Conn } from "./raw";
