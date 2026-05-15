-- =============================================================================
-- MYMR-151 Neon prod provisioning
-- Project: ancient-scene-55031748 (Mymir)
-- Date: 2026-05-15
-- Runs against: production Neon main branch
--
-- Order matters. Statements marked [UI-ONLY] cannot be run via SQL on Neon
-- because they require SUPERUSER (only cloud_admin is). Use Neon console's
-- role-management panel for those. Everything else runs fine as neondb_owner
-- via the Neon SQL editor or via this app's Neon MCP / psql connection.
--
-- KEEP IN SYNC WITH:
--   docker/init-rls.sh (self-host provisioning)
--   tests/setup/migrate.ts (testcontainer provisioning)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ROLES
-- -----------------------------------------------------------------------------
-- These two CREATE ROLE statements are the SQL equivalent of what the Neon
-- console UI does, but on Neon you cannot run them via SQL with these explicit
-- attributes (permission denied: only cloud_admin can set BYPASSRLS etc.).
-- On Neon: create via "Add role" in the console, then toggle attributes in
-- the role-detail panel. On self-hosted Postgres or another platform where
-- the migration role IS a superuser, these statements run as-is.
-- -----------------------------------------------------------------------------

-- [UI-ONLY on Neon] runtime app role, RLS-enforcing
CREATE ROLE app_user WITH
    LOGIN
    INHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD '<set-via-neon-console>';

-- [UI-ONLY on Neon] service bypass role, used by 4 functions only
CREATE ROLE service_role WITH
    LOGIN
    INHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    BYPASSRLS
    PASSWORD '<set-via-neon-console>';

-- [UI-ONLY on Neon] Better Auth runtime role, DML on neon_auth.* only
CREATE ROLE auth_role WITH
    LOGIN
    INHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD '<set-via-neon-console>';


-- -----------------------------------------------------------------------------
-- 2. SCHEMA-LEVEL GRANTS (runs as neondb_owner -- no special perms needed)
-- -----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO app_user, service_role;
GRANT USAGE ON SCHEMA neon_auth TO app_user, service_role, auth_role;

-- service_role only: lets `drizzle-kit migrate` create new tables when migrating
-- via DATABASE_SERVICE_ROLE_URL. app_user must NEVER have CREATE on public.
GRANT CREATE ON SCHEMA public TO service_role;


-- -----------------------------------------------------------------------------
-- 3. TABLE-LEVEL GRANTS (existing tables)
-- -----------------------------------------------------------------------------

-- public: full DML on the 8 RLS-protected tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
    TO app_user, service_role;

-- neon_auth: TIGHT grants for app_user (no SELECT on sensitive tables)
GRANT SELECT, REFERENCES ON neon_auth."member" TO app_user;
GRANT SELECT, REFERENCES ON neon_auth.organization TO app_user;
GRANT SELECT, REFERENCES ON neon_auth."user" TO app_user;
GRANT SELECT, REFERENCES ON neon_auth.invitation TO app_user;

-- service_role: tight neon_auth SELECT + DML on session/oauth* for clearOrgMembershipArtifacts
GRANT SELECT, REFERENCES ON neon_auth."member" TO service_role;
GRANT SELECT, REFERENCES ON neon_auth.organization TO service_role;
GRANT SELECT, REFERENCES ON neon_auth."user" TO service_role;
GRANT SELECT, REFERENCES ON neon_auth.invitation TO service_role;
GRANT SELECT, UPDATE ON neon_auth."session" TO service_role;
GRANT SELECT, DELETE ON neon_auth."oauthAccessToken" TO service_role;
GRANT SELECT, DELETE ON neon_auth."oauthRefreshToken" TO service_role;
GRANT SELECT, DELETE ON neon_auth."oauthConsent" TO service_role;

-- auth_role: full DML on every neon_auth table
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA neon_auth TO auth_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA neon_auth TO auth_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA neon_auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_role;


-- -----------------------------------------------------------------------------
-- 4. DEFAULT PRIVILEGES (future tables created by neondb_owner)
-- -----------------------------------------------------------------------------
-- When `drizzle-kit migrate` creates new tables (it runs as service_role, which
-- has CREATE on schema public), they automatically get the same DML grants.
-- Without this, every migration would need a follow-up GRANT.
-- -----------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
    TO app_user, service_role;


-- -----------------------------------------------------------------------------
-- 5. SEQUENCES (current + default)
-- -----------------------------------------------------------------------------
-- Insurance for any drizzle-generated serial PKs. Mymir's schema uses
-- gen_random_uuid() for IDs today, but this future-proofs the grants.
-- -----------------------------------------------------------------------------

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
    TO app_user, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES
    TO app_user, service_role;


-- -----------------------------------------------------------------------------
-- 6. drizzle-kit migrate prerequisites
-- -----------------------------------------------------------------------------
-- Added after the initial provisioning when the implementer discovered
-- drizzle-kit's runtime requirements during MYMR-151 implementation:
--   `drizzle-kit migrate` issues `CREATE SCHEMA IF NOT EXISTS drizzle`
--   unconditionally to provision its own migrations-tracking schema. This
--   requires CREATE on the database itself (not just on schema public).
--   Pre-creating the drizzle schema + granting service_role on it avoids
--   the per-migration permission check.
-- -----------------------------------------------------------------------------

GRANT CREATE ON DATABASE neondb TO service_role;
CREATE SCHEMA IF NOT EXISTS drizzle;
GRANT USAGE, CREATE ON SCHEMA drizzle TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;


-- -----------------------------------------------------------------------------
-- 7. COMPOSITE INDEX for RLS predicate performance
-- -----------------------------------------------------------------------------
-- All 8 RLS policies dispatch via:
--   EXISTS (SELECT 1 FROM neon_auth.member m
--           WHERE m.organization_id = projects.organization_id
--             AND m.user_id = current_setting('app.user_id', TRUE)::uuid)
-- Individual indexes on organization_id and user_id exist, but a composite
-- speeds the policy predicate to a single index lookup per row evaluated.
-- Idempotent.
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS member_org_user_idx
    ON neon_auth."member" ("organizationId", "userId");


-- -----------------------------------------------------------------------------
-- 8. VERIFY app_user has NO grants on sensitive auth tables
-- -----------------------------------------------------------------------------
-- Expected: empty result (zero rows)
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'app_user'
  AND table_schema = 'neon_auth'
  AND table_name IN (
    'session','account','verification','oauthClient',
    'oauthAccessToken','oauthRefreshToken','oauthConsent','jwks'
  );


-- -----------------------------------------------------------------------------
-- 9. SECURITY DEFINER functions (invite-code join flow)
-- -----------------------------------------------------------------------------
-- Apply by running docker/rls-functions.sql as neondb_owner via the Neon SQL
-- editor or psql. The function bodies are reviewed alongside
-- docker/rls-functions.sql; this section is a pointer (not a duplicate) so
-- the prod runbook stays the single source of truth for what runs on Neon.
--
-- Functions installed:
--   public.lookup_team_invite_code(text)
--   public.reserve_team_invite_code_slot(text)
--   public.release_team_invite_code_slot(uuid)
--
-- EXECUTE granted to app_user only.
-- -----------------------------------------------------------------------------

-- [Apply docker/rls-functions.sql as neondb_owner]


-- [PROD UPDATE 2026-05-15] team_invite_code policy split for admin-only writes.
-- The previous member-access policy let any org member INSERT/UPDATE/DELETE
-- invite codes via direct SQL. Apply by re-running docker/rls-policies.sql
-- against the Neon prod database.

-- [PROD UPDATE 2026-05-15] Added list_org_project_ids(uuid) SECURITY DEFINER
-- function for revokeOrgAccess. Apply by re-running docker/rls-functions.sql
-- against the Neon prod database.


-- =============================================================================
-- VERIFICATION QUERIES (read-only; safe to re-run anytime)
-- =============================================================================

-- Confirm role attributes (expected: app_user.rolbypassrls=false; service_role.rolbypassrls=true)
SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
       rolreplication, rolinherit, rolcanlogin
FROM pg_roles
WHERE rolname IN ('app_user', 'service_role')
ORDER BY rolname;

-- Confirm no leftover neon_superuser membership (expected: empty result)
SELECT r.rolname AS role, gr.rolname AS member_of
FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.member
JOIN pg_roles gr ON gr.oid = m.roleid
WHERE r.rolname IN ('app_user', 'service_role')
ORDER BY r.rolname, gr.rolname;

-- Confirm public table grants (expected: 4 rows per role per table)
SELECT grantee, table_name,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
FROM information_schema.table_privileges
WHERE grantee IN ('app_user', 'service_role')
  AND table_schema = 'public'
GROUP BY grantee, table_name
ORDER BY table_name, grantee;

-- Confirm neon_auth grants per role
-- Expected:
--   app_user: SELECT + REFERENCES on member/organization/user/invitation only (8 rows: 4 tables × 2 privs)
--   service_role: same as app_user, PLUS SELECT/UPDATE on session, SELECT/DELETE on oauth* tables
--   auth_role: SELECT/INSERT/UPDATE/DELETE on every neon_auth table
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee IN ('app_user', 'service_role', 'auth_role')
  AND table_schema = 'neon_auth'
ORDER BY grantee, table_name, privilege_type;

-- Confirm composite index exists (expected: one row)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'neon_auth'
  AND tablename = 'member'
  AND indexname = 'member_org_user_idx';


-- -----------------------------------------------------------------------------
-- 10. SMOKE TEST after prod flip
-- -----------------------------------------------------------------------------
-- Run these queries from the Neon SQL editor connected as neondb_owner AFTER
-- flipping DATABASE_URL to point at app_user. Expected results below each
-- query show what each role can and cannot see.
-- -----------------------------------------------------------------------------

-- (a) confirm a SELECT from neon_auth.account as app_user is denied
SET ROLE app_user;
SELECT 1 FROM neon_auth.account LIMIT 1;
-- Expected: ERROR: permission denied for table account
RESET ROLE;

-- (b) confirm an unscoped SELECT from public.projects under app_user with
--     no GUC set returns zero rows (default-deny via RLS)
SET ROLE app_user;
SELECT count(*) FROM public.projects;  -- expected: 0
RESET ROLE;

-- (c) confirm SECURITY DEFINER function is reachable from app_user
SET ROLE app_user;
SELECT * FROM public.lookup_team_invite_code('<nonexistent-code>');
-- Expected: zero rows, no error (function executes; just no match)
RESET ROLE;

-- (d) confirm auth_role has no grants on public
SET ROLE auth_role;
SELECT 1 FROM public.projects LIMIT 1;
-- Expected: ERROR: permission denied for table projects
RESET ROLE;

-- (e) confirm app_user has tight neon_auth grants (only member/organization/user/invitation)
SET ROLE app_user;
SELECT 1 FROM neon_auth."session" LIMIT 1;
-- Expected: ERROR: permission denied for table session
SELECT 1 FROM neon_auth.jwks LIMIT 1;
-- Expected: ERROR: permission denied for table jwks
RESET ROLE;
