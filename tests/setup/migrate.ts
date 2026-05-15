import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

/**
 * Provision the test container with the same role split the self-host
 * Docker compose file builds: `app_user` (no BYPASSRLS, runtime role
 * exercising RLS) and `service_role` (BYPASSRLS, runs migrations and the
 * documented bypass call sites).
 *
 * The testcontainer can't run `docker/init-rls.sh` from
 * `/docker-entrypoint-initdb.d/` (it ships POSTGRES_USER=mymir without
 * the password env vars), so we replicate the role + grant steps here.
 *
 * @param sql - Active postgres client (must be the container superuser).
 */
async function provisionRoles(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        EXECUTE 'CREATE ROLE app_user LOGIN PASSWORD ''app_user''';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'CREATE ROLE service_role LOGIN BYPASSRLS PASSWORD ''service_role''';
      END IF;
    END $$;

    GRANT USAGE ON SCHEMA public TO app_user, service_role;
    GRANT CREATE ON SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, service_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO app_user, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE service_role IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE service_role IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO app_user;

    GRANT USAGE ON SCHEMA neon_auth TO app_user, service_role;
    GRANT SELECT, REFERENCES ON ALL TABLES IN SCHEMA neon_auth TO app_user, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA neon_auth
      GRANT SELECT, REFERENCES ON TABLES TO app_user, service_role;
  `);
}

/**
 * Apply every `drizzle/NNNN_*.sql` migration file in order. The migration
 * files are split on the `--> statement-breakpoint` marker drizzle-kit
 * emits; each chunk is executed as a separate statement so policy DDL
 * (which `drizzle-kit push` silently drops) lands intact.
 *
 * @param sql - Active postgres client (uses superuser or service_role).
 */
async function applyDrizzleMigrations(
  sql: ReturnType<typeof postgres>,
): Promise<void> {
  const dir = join(process.cwd(), "drizzle");
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }
  }
}

/**
 * Apply `docker/init-auth.sql` (the neon_auth schema for self-hosted
 * Postgres), provision the RLS role split (`app_user` + `service_role`),
 * and run every drizzle migration in order. Run once per container at
 * `globalSetup`.
 *
 * Drizzle-kit `push` is intentionally NOT used: it silently drops the
 * `USING`/`WITH CHECK` clauses on policy DDL during introspection-based
 * diffing. Applying the generated migration files literally is the only
 * way to land non-empty policy predicates.
 *
 * @param url - Connection string for the target database.
 */
export async function applyMigrations(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    const initAuth = readFileSync(
      join(process.cwd(), "docker", "init-auth.sql"),
      "utf8",
    );
    await sql.unsafe(initAuth);
    // `init-auth.sql` calls `SET search_path TO neon_auth` for the duration
    // of its CREATE TABLEs. The setting persists on the pooled connection;
    // reset it so the drizzle migrations land in the `public` schema as
    // they expect.
    await sql.unsafe("SET search_path TO public, neon_auth");
    await provisionRoles(sql);
    await applyDrizzleMigrations(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
