#!/bin/bash
# Provision RLS-aware roles for self-hosted Postgres so a fresh clone
# exercises real RLS and matches Neon production parity. Idempotent —
# safe to re-run on existing databases.
#
# Three-role structure (mirrors Neon prod):
#   * mymir (Docker POSTGRES_USER, container superuser) — DB owner, used for
#     bootstrap and human admin via psql. Equivalent of Neon `neondb_owner`.
#     NOT used by the app at runtime.
#   * service_role — BYPASSRLS + CREATE on schema public, used by:
#       - `drizzle-kit push` migration runner (via DATABASE_SERVICE_ROLE_URL)
#       - the 4 documented bypass call sites (reserve/release/diagnose
#         invite-code, clearOrgMembershipArtifacts)
#   * app_user — NO BYPASSRLS, the runtime role for the Next.js app
#     (via DATABASE_URL). RLS policies fire on every query.
#
# Passwords flow in from docker-compose's environment block.
set -euo pipefail

: "${APP_USER_PASSWORD:?APP_USER_PASSWORD env var is required}"
: "${SERVICE_ROLE_PASSWORD:?SERVICE_ROLE_PASSWORD env var is required}"

# Reject quotes/backslashes in passwords — they would break the SQL literal
# escaping below. openssl rand -base64 24 outputs `[A-Za-z0-9+/=]` only, so
# this never trips on caller-generated passwords from the documented flow.
for pw in "$APP_USER_PASSWORD" "$SERVICE_ROLE_PASSWORD"; do
  case "$pw" in
    *\'*|*\"*|*\\*)
      echo "init-rls.sh: passwords must not contain quotes or backslashes" >&2
      exit 1
      ;;
  esac
done

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  <<EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'CREATE ROLE app_user LOGIN PASSWORD ''${APP_USER_PASSWORD}''';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role LOGIN BYPASSRLS PASSWORD ''${SERVICE_ROLE_PASSWORD}''';
  END IF;
END \$\$;

-- Grants on public schema. Drizzle-kit push runs as service_role (CREATE on
-- schema public + BYPASSRLS). app_user is read/write only; never CREATE.
GRANT USAGE ON SCHEMA public TO app_user, service_role;
GRANT CREATE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, service_role;
-- Default privileges fire on tables created by the GRANTOR role. Set them
-- for BOTH mymir (the container superuser, who runs the initial table CREATE
-- on legacy boots) AND service_role (who runs drizzle-kit push from
-- DATABASE_SERVICE_ROLE_URL going forward). Without the FOR ROLE clause,
-- tables that service_role creates have no implicit grants and app_user
-- gets "permission denied" on default-deny lookups.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE service_role IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE service_role IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Grants on neon_auth schema. RLS policies join through \`neon_auth.member\`,
-- so app_user needs SELECT on the auth tables for policy evaluation. Both
-- runtime roles are READ-ONLY on neon_auth — Better Auth (separate authDb
-- client, runs as the \`mymir\` owner) owns writes. REFERENCES is also
-- required so drizzle-kit's catalog introspection can resolve the
-- cross-schema FKs from public.projects → neon_auth.organization etc.
GRANT USAGE ON SCHEMA neon_auth TO app_user, service_role;
GRANT SELECT, REFERENCES ON ALL TABLES IN SCHEMA neon_auth TO app_user, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA neon_auth
  GRANT SELECT, REFERENCES ON TABLES TO app_user, service_role;

-- Drizzle-kit's \`migrate\` command tracks applied migrations in
-- \`drizzle.__drizzle_migrations\`. Pre-create the schema and grant
-- service_role on it so the migration runner (which connects via
-- DATABASE_SERVICE_ROLE_URL) can read/write its own metadata. Also grant
-- CREATE on database so drizzle-kit's internal "CREATE SCHEMA IF NOT
-- EXISTS drizzle" call succeeds (it runs unconditionally even when the
-- schema already exists).
GRANT CREATE ON DATABASE "${POSTGRES_DB}" TO service_role;
CREATE SCHEMA IF NOT EXISTS drizzle;
GRANT USAGE, CREATE ON SCHEMA drizzle TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
EOSQL
