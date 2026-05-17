-- =============================================================================
-- Neon prod provisioning runbook
--
-- Order matters. Statements marked [UI-ONLY] need the Neon console (only
-- cloud_admin can set BYPASSRLS via SQL). Everything else runs as neondb_owner
-- via the Neon SQL editor, the Neon MCP, or psql.
--
-- ORDERING INVARIANT: docker/rls-functions.sql MUST be applied before
-- docker/rls-policies.sql. Policies reference public.current_user_org_ids();
-- reversing the order takes the app offline.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ROLES
-- -----------------------------------------------------------------------------
-- On Neon: create each role from the console role panel, then set the
-- BYPASSRLS attribute on service_role only. Set passwords there as well.
-- The CREATE ROLE blocks below document the intended attributes; they run
-- as-is on self-hosted Postgres where the migration role is superuser.
-- -----------------------------------------------------------------------------

-- [UI-ONLY on Neon] runtime app role, RLS enforcing
CREATE ROLE app_user WITH
    LOGIN
    INHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD '<set via Neon console>';

-- [UI-ONLY on Neon] service bypass role, used by migrations and 3 SDFs
CREATE ROLE service_role WITH
    LOGIN
    INHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    BYPASSRLS
    PASSWORD '<set via Neon console>';

-- [UI-ONLY on Neon] Better Auth runtime role, DML on neon_auth.* only
CREATE ROLE auth_role WITH
    LOGIN
    INHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD '<set via Neon console>';


-- -----------------------------------------------------------------------------
-- 2. SCHEMA / TABLE / SEQUENCE GRANTS
-- -----------------------------------------------------------------------------
-- Apply docker/grants.sql as neondb_owner. That file is the single source of
-- truth for grants across prod, self-host, and tests.
--
-- New public or neon_auth tables MUST receive explicit grants in their
-- migration. Default privileges on both schemas are intentionally removed
-- to prevent auto-granting DML before RLS attaches.
-- -----------------------------------------------------------------------------

-- [Apply docker/grants.sql as neondb_owner]


-- -----------------------------------------------------------------------------
-- 3. drizzle-kit migrate prerequisites
-- -----------------------------------------------------------------------------
-- drizzle-kit migrate issues CREATE SCHEMA IF NOT EXISTS drizzle on every run,
-- which requires CREATE on the database itself. Pre-creating the schema and
-- granting service_role avoids the per-migration permission check.
-- -----------------------------------------------------------------------------

GRANT CREATE ON DATABASE neondb TO service_role;
CREATE SCHEMA IF NOT EXISTS drizzle;
GRANT USAGE, CREATE ON SCHEMA drizzle TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;


-- -----------------------------------------------------------------------------
-- 4. COMPOSITE INDEX for RLS predicate performance
-- -----------------------------------------------------------------------------
-- public.current_user_org_ids() (hot path behind every policy) filters
-- neon_auth.member on both ("userId", "organizationId"). Single column indexes
-- force a bitmap AND; the composite collapses to one lookup per call.
-- Idempotent.
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS member_org_user_idx
    ON neon_auth."member" ("organizationId", "userId");


-- -----------------------------------------------------------------------------
-- 5. SECURITY DEFINER functions and triggers
-- -----------------------------------------------------------------------------
-- Apply docker/rls-functions.sql as neondb_owner. The file is the canonical
-- inventory. Re-applying is idempotent.
-- -----------------------------------------------------------------------------

-- [Apply docker/rls-functions.sql as neondb_owner]


-- -----------------------------------------------------------------------------
-- 6. RLS policies, ENABLE, FORCE
-- -----------------------------------------------------------------------------
-- Apply docker/rls-policies.sql as neondb_owner AFTER section 5. The file also
-- issues ENABLE ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY on the 8
-- public tables, which the self-host path gets implicitly via drizzle-kit
-- push but the Neon prod path (drizzle-kit migrate) does not.
-- -----------------------------------------------------------------------------

-- [Apply docker/rls-policies.sql as neondb_owner]


-- =============================================================================
-- VERIFICATION QUERIES (read only, safe to re-run anytime)
-- =============================================================================

-- Role attributes. Expected: app_user.rolbypassrls=false, service_role.rolbypassrls=true.
SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
       rolreplication, rolinherit, rolcanlogin
FROM pg_roles
WHERE rolname IN ('app_user', 'service_role', 'auth_role')
ORDER BY rolname;

-- Leftover neon_superuser membership. Expected: empty.
SELECT r.rolname AS role, gr.rolname AS member_of
FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.member
JOIN pg_roles gr ON gr.oid = m.roleid
WHERE r.rolname IN ('app_user', 'service_role', 'auth_role')
ORDER BY r.rolname, gr.rolname;

-- Public table grants. Expected: one row per role per table, privs =
-- 'DELETE, INSERT, SELECT, UPDATE'. Source of truth: docker/grants.sql.
SELECT grantee, table_name,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
FROM information_schema.table_privileges
WHERE grantee IN ('app_user', 'service_role')
  AND table_schema = 'public'
GROUP BY grantee, table_name
ORDER BY table_name, grantee;

-- neon_auth grants per role. Source of truth: docker/grants.sql.
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee IN ('app_user', 'service_role', 'auth_role')
  AND table_schema = 'neon_auth'
ORDER BY grantee, table_name, privilege_type;

-- Composite index. Expected: one row.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'neon_auth'
  AND tablename = 'member'
  AND indexname = 'member_org_user_idx';

-- SECURITY DEFINER function count. Cross check against docker/rls-functions.sql.
SELECT count(*) AS sdf_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true;

-- RLS enabled and forced on every public table. Expected: both true on 8 rows.
SELECT c.relname, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;


-- -----------------------------------------------------------------------------
-- 7. SMOKE TESTS after prod flip
-- -----------------------------------------------------------------------------
-- Run from the Neon SQL editor as neondb_owner AFTER flipping DATABASE_URL.
-- -----------------------------------------------------------------------------

-- (a) app_user is denied on neon_auth.account
SET ROLE app_user;
SELECT 1 FROM neon_auth.account LIMIT 1;
-- Expected: ERROR: permission denied for table account
RESET ROLE;

-- (b) unscoped SELECT under app_user with no GUC returns zero rows (default deny)
SET ROLE app_user;
SELECT count(*) FROM public.projects;  -- expected: 0
RESET ROLE;

-- (c) lookup_team_invite_code is service_role only
SET ROLE app_user;
SELECT * FROM public.lookup_team_invite_code('nonexistent');
-- Expected: ERROR: permission denied for function lookup_team_invite_code
RESET ROLE;

-- (d) auth_role cannot read public
SET ROLE auth_role;
SELECT 1 FROM public.projects LIMIT 1;
-- Expected: ERROR: permission denied for table projects
RESET ROLE;

-- (e) app_user is revoked from every neon_auth table; reads must route through SDFs
SET ROLE app_user;
SELECT 1 FROM neon_auth."member" LIMIT 1;  -- Expected: ERROR: permission denied
SELECT 1 FROM neon_auth."user" LIMIT 1;    -- Expected: ERROR: permission denied
SELECT 1 FROM neon_auth."session" LIMIT 1; -- Expected: ERROR: permission denied
SELECT 1 FROM neon_auth.jwks LIMIT 1;      -- Expected: ERROR: permission denied
RESET ROLE;

-- (f) app_user can call SDFs granted to it; no GUC returns the default deny shape
SET ROLE app_user;
SELECT public.current_user_has_any_membership();  -- Expected: false
SELECT public.current_user_org_ids();             -- Expected: {}
RESET ROLE;


-- -----------------------------------------------------------------------------
-- 8. REVOKE TEMPORARY ON DATABASE from PUBLIC (CVE-2018-1058)
-- -----------------------------------------------------------------------------
-- Belt alongside pg_temp pinned last in every SDF search_path. Removes the
-- privilege that lets app_user create temp objects shadowing operators or
-- functions inside SDF bodies. service_role and auth_role lose TEMPORARY too;
-- no code path creates temp tables (drizzle uses the permanent drizzle.*
-- schema). Re-grant explicitly if a future feature needs it.
-- -----------------------------------------------------------------------------

REVOKE TEMPORARY ON DATABASE neondb FROM PUBLIC;

-- Verify. Expected: all three false.
SELECT has_database_privilege('app_user',     'neondb', 'TEMPORARY') AS app_user_temp;
SELECT has_database_privilege('service_role', 'neondb', 'TEMPORARY') AS service_role_temp;
SELECT has_database_privilege('auth_role',    'neondb', 'TEMPORARY') AS auth_role_temp;
