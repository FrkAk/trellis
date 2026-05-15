import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { executeRawDiscard } from "@/lib/db/raw";

/**
 * Drizzle transaction handle. Distinct from `Conn` (which is `db | Tx`) — this
 * alias is the narrow callback argument that `db.transaction(fn)` passes to
 * `fn`. The data ring's helpers expect this exact shape (they call methods
 * like `tx.delete(...).returning()` that `db` does not expose), so the
 * {@link withUserContext} callback receives this rather than the union.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// RFC 4122 UUID, any version, case-insensitive. set_config will accept
// arbitrary strings, but our RLS predicates cast to uuid; rejecting non-UUID
// shape here turns a Postgres "invalid input syntax for type uuid" 500 into
// a clean TypeError. Unicode whitespace (U+00A0, U+2003, etc.), control
// chars, empty strings, and non-UUID payloads all fail this regex.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn` inside a Drizzle transaction with `app.user_id` set to the supplied
 * user id for the lifetime of the transaction. The GUC clears automatically on
 * commit/rollback so it never leaks across pooled connections (Neon pgBouncer
 * operates in transaction-pooling mode).
 *
 * `set_config(name, value, true)` is used rather than `SET LOCAL app.user_id =
 * $1` because `SET LOCAL`'s value is a literal — `drizzle-orm`'s `sql` tag
 * parameterizes the value, which Postgres rejects for `SET`. The third arg
 * `true` is `is_local`; scope is identical to `SET LOCAL`.
 *
 * @param userId - Authenticated user id (typically `AuthContext.userId`).
 *   Must be a valid RFC 4122 UUID string.
 * @param fn - Async callback that performs the protected work.
 * @returns Whatever `fn` returns.
 * @throws {TypeError} When `userId` is not a valid UUID string. Surfaces
 *   misuse loudly instead of silently degrading to default-deny.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    throw new TypeError(
      "withUserContext: userId must be a valid UUID string",
    );
  }
  return db.transaction(async (tx) => {
    await executeRawDiscard(
      tx,
      sql`SELECT set_config('app.user_id', ${userId}, true)`,
    );
    return fn(tx);
  });
}
