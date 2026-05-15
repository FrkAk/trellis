import { startContainer, stopContainer } from "./container";
import { applyMigrations } from "./migrate";

declare global {
  var __mymirTestSetupRan: boolean | undefined;
}

/**
 * Idempotent global setup: start the test container and apply migrations
 * once per process. Subsequent calls are no-ops. Call from `beforeAll`
 * in test files that need real DB access.
 */
export async function setup() {
  if (globalThis.__mymirTestSetupRan) return;
  const url = await startContainer();
  process.env.DATABASE_URL = url;
  // The 4 documented bypass call sites pull from `DATABASE_SERVICE_ROLE_URL`.
  // The test container starts as the superuser, which is BYPASSRLS by
  // default, so the same connection string satisfies the bypass contract.
  process.env.DATABASE_SERVICE_ROLE_URL = url;
  await applyMigrations(url);
  globalThis.__mymirTestSetupRan = true;
}

/** Stop the test container. Call from `afterAll` if you want explicit
 * teardown, but Bun will reap the container on process exit anyway. */
export async function teardown() {
  await stopContainer();
  globalThis.__mymirTestSetupRan = false;
}
