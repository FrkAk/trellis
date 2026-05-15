import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as appSchema from "@/lib/db/schema";
import { getConnectionString } from "./container";

/**
 * Application Drizzle client cached on `globalThis` by
 * `@/lib/db/connection`. We don't import the alias because it's an
 * internal type; the inferred shape from `drizzle(postgres(...))` is
 * structurally compatible.
 */
type AppDbCache = ReturnType<typeof drizzle<typeof appSchema>>;

/**
 * Run `fn` with the application `db` Proxy temporarily pointed at the
 * `app_user` Postgres role.
 *
 * `tests/setup/global.ts` points `DATABASE_URL` at the testcontainer
 * superuser, which has implicit BYPASSRLS, so production code paths
 * silently bypass RLS in the default `bun run test` lane. This helper
 * swaps `globalThis.__mymirAppDb` (the cache the `db` Proxy in
 * `@/lib/db/connection` reads from) for the duration of `fn`, so any
 * code that imports `db` from `@/lib/db` inside `fn` transparently
 * runs as `app_user` — exactly the role production runs as. Restores
 * the original cache on exit (success or failure) so other tests
 * aren't poisoned.
 *
 * Use this when a test asserts behavior that depends on RLS firing
 * (cross-team rejection, default-deny without a `withUserContext`
 * frame). Tests that only need the default superuser lane don't need
 * this helper.
 *
 * @param fn - Callback to run with the swapped client.
 * @returns Whatever `fn` returns.
 */
export async function withAppUserDb<T>(fn: () => Promise<T>): Promise<T> {
  const url = new URL(getConnectionString());
  url.username = "app_user";
  url.password = "app_user";
  const client = postgres(url.toString(), { max: 1 });
  const appUserDb = drizzle(client, { schema: appSchema });

  const g = globalThis as unknown as { __mymirAppDb: AppDbCache | undefined };
  const previous = g.__mymirAppDb;
  g.__mymirAppDb = appUserDb;
  try {
    return await fn();
  } finally {
    g.__mymirAppDb = previous;
    await client.end({ timeout: 5 });
  }
}
