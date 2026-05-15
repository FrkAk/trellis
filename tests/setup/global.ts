import { startContainer, stopContainer } from "./container";
import { applyMigrations } from "./migrate";

declare global {
  var __mymirTestSetupRan: boolean | undefined;
}

/**
 * Idempotent global setup: start the test container, apply migrations as
 * the container superuser, then rewrite `DATABASE_URL` to `app_user` so
 * every test exercises the production RLS-bound role. `DATABASE_AUTH_URL`
 * and `DATABASE_SERVICE_ROLE_URL` are rewritten to their dedicated roles
 * for the same reason. Migrations run against the original superuser URL
 * because policies, role grants, and `drizzle-kit push` need owner rights.
 * Subsequent calls are no-ops.
 */
export async function setup() {
  if (globalThis.__mymirTestSetupRan) return;
  const url = await startContainer();
  const rewriteRole = (role: string) =>
    url.replace(
      /^(postgres(?:ql)?):\/\/[^:]+:[^@]+@/,
      `$1://${role}:${role}@`,
    );
  await applyMigrations(url);
  process.env.DATABASE_URL = rewriteRole("app_user");
  process.env.DATABASE_AUTH_URL = rewriteRole("auth_role");
  process.env.DATABASE_SERVICE_ROLE_URL = rewriteRole("service_role");
  globalThis.__mymirTestSetupRan = true;
}

/** Stop the test container. Call from `afterAll` if you want explicit
 * teardown, but Bun will reap the container on process exit anyway. */
export async function teardown() {
  await stopContainer();
  globalThis.__mymirTestSetupRan = false;
}
