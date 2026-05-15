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
  const baseUrl = process.env.DATABASE_URL!;
  process.env.DATABASE_AUTH_URL = baseUrl.replace(
    /^(postgres(?:ql)?):\/\/[^:]+:[^@]+@/,
    "$1://auth_role:auth_role@",
  );
  process.env.DATABASE_SERVICE_ROLE_URL = baseUrl.replace(
    /^(postgres(?:ql)?):\/\/[^:]+:[^@]+@/,
    "$1://service_role:service_role@",
  );
  await applyMigrations(url);
  if (process.env.MYMIR_TEST_AS_APP_USER === "1") {
    process.env.DATABASE_URL = baseUrl.replace(
      /^(postgres(?:ql)?):\/\/[^:]+:[^@]+@/,
      "$1://app_user:app_user@",
    );
  }
  globalThis.__mymirTestSetupRan = true;
}

/** Stop the test container. Call from `afterAll` if you want explicit
 * teardown, but Bun will reap the container on process exit anyway. */
export async function teardown() {
  await stopContainer();
  globalThis.__mymirTestSetupRan = false;
}
