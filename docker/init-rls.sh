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
: "${AUTH_ROLE_PASSWORD:?AUTH_ROLE_PASSWORD env var is required}"

for pw in "$APP_USER_PASSWORD" "$SERVICE_ROLE_PASSWORD" "$AUTH_ROLE_PASSWORD"; do
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
-- NOBYPASSRLS is explicit on app_user/auth_role so a future ALTER ROLE
-- can be audited; without it, a silent BYPASSRLS flip would void RLS without
-- touching this file.
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'CREATE ROLE app_user LOGIN NOBYPASSRLS PASSWORD ''${APP_USER_PASSWORD}''';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role LOGIN BYPASSRLS PASSWORD ''${SERVICE_ROLE_PASSWORD}''';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_role') THEN
    EXECUTE 'CREATE ROLE auth_role LOGIN NOBYPASSRLS PASSWORD ''${AUTH_ROLE_PASSWORD}''';
  END IF;
END \$\$;

-- KEEP IN SYNC WITH:
--   tests/setup/migrate.ts (testcontainer provisioning)
--   docs/neon-prod-provisioning.sql (Neon prod runbook)
-- Diverging grants here will cause prod/test/self-host parity drift.

-- public schema grants (RLS-enforced for app_user)
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

-- app_user reaches neon_auth.* only via SECURITY DEFINER functions in
-- docker/rls-functions.sql. The explicit REVOKEs make re-runs idempotent
-- when upgrading from the pre-lockdown provisioning.
GRANT USAGE ON SCHEMA neon_auth TO service_role, auth_role;
REVOKE ALL ON SCHEMA neon_auth FROM app_user;
REVOKE ALL ON ALL TABLES IN SCHEMA neon_auth FROM app_user;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA neon_auth FROM app_user;

-- service_role: same tight set on neon_auth (used only by clearOrgMembershipArtifacts)
GRANT SELECT, REFERENCES ON neon_auth."member" TO service_role;
GRANT SELECT, REFERENCES ON neon_auth.organization TO service_role;
GRANT SELECT, REFERENCES ON neon_auth."user" TO service_role;
GRANT SELECT, REFERENCES ON neon_auth.invitation TO service_role;
-- service_role also needs DML on session + oauth* for clearOrgMembershipArtifacts
GRANT SELECT, UPDATE ON neon_auth."session" TO service_role;
GRANT SELECT, DELETE ON neon_auth."oauthAccessToken" TO service_role;
GRANT SELECT, DELETE ON neon_auth."oauthRefreshToken" TO service_role;
GRANT SELECT, DELETE ON neon_auth."oauthConsent" TO service_role;

-- auth_role: full DML on every neon_auth table (Better Auth's runtime connection)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA neon_auth TO auth_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA neon_auth TO auth_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA neon_auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_role;
-- auth_role has NO grants on public; it cannot touch app data even via SQLi

-- drizzle migrations schema (service_role only)
GRANT CREATE ON DATABASE "${POSTGRES_DB}" TO service_role;
CREATE SCHEMA IF NOT EXISTS drizzle;
GRANT USAGE, CREATE ON SCHEMA drizzle TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
EOSQL
