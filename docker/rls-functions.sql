-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers for the team-invite-code join flow.
--
-- These functions run as their OWNER (the role that installs them — the DB
-- superuser in self-host, neondb_owner in Neon prod), not as the caller.
-- That lets a joining user — who has NO neon_auth.member row for the target
-- org yet — complete the lookup and slot-reservation steps without the JS
-- data ring holding a BYPASSRLS (service_role) connection.
--
-- Each function has a narrow surface and strict input handling. EXECUTE is
-- granted to app_user only; the public role gets nothing. Audit by reading
-- this file — every SECURITY DEFINER body is reviewable in one place.
--
-- KEEP IN SYNC WITH:
--   lib/data/team-invite-code.ts (JS callers)
--   docs/neon-prod-provisioning.sql section 9 (prod runbook pointer)
-- ---------------------------------------------------------------------------

-- Lookup a code's metadata. Used by diagnoseTeamInviteCode for ops triage.
CREATE OR REPLACE FUNCTION public.lookup_team_invite_code(p_code text)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  default_role text,
  revoked_at timestamptz,
  expires_at timestamptz,
  max_uses integer,
  use_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT id, organization_id, default_role, revoked_at, expires_at, max_uses, use_count
  FROM public.team_invite_code
  WHERE code = p_code
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.lookup_team_invite_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_team_invite_code(text) TO app_user;

-- Atomically reserve a slot on a valid, non-revoked, non-expired,
-- non-exhausted code. Returns the row identifiers on success, empty set on
-- failure (anti-enumeration — caller cannot distinguish failure reasons).
CREATE OR REPLACE FUNCTION public.reserve_team_invite_code_slot(p_code text)
RETURNS TABLE (id uuid, organization_id uuid, default_role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.team_invite_code
     SET use_count = use_count + 1,
         updated_at = NOW()
   WHERE code = p_code
     AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > NOW())
     AND (max_uses IS NULL OR use_count < max_uses)
  RETURNING id, organization_id, default_role;
$$;
REVOKE EXECUTE ON FUNCTION public.reserve_team_invite_code_slot(text) FROM public;
GRANT EXECUTE ON FUNCTION public.reserve_team_invite_code_slot(text) TO app_user;

-- Decrement a reserved slot when downstream add-member fails. Floors at 0.
CREATE OR REPLACE FUNCTION public.release_team_invite_code_slot(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.team_invite_code
     SET use_count = GREATEST(use_count - 1, 0),
         updated_at = NOW()
   WHERE id = p_id;
$$;
REVOKE EXECUTE ON FUNCTION public.release_team_invite_code_slot(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.release_team_invite_code_slot(uuid) TO app_user;

-- Admin/system lookup: list project ids for an org without scoping by the
-- caller's membership. Used by lib/realtime/access.ts:revokeOrgAccess which
-- runs in better-auth's afterRemoveMember hook — at that point the user's
-- membership row is gone, so a member-scoped lookup returns zero rows.
--
-- SECURITY: EXECUTE granted to service_role ONLY (not app_user). Cross-org
-- project enumeration would otherwise be reachable from any compromised
-- app_user session. The JS data ring calls this via serviceRoleDb, which
-- is already the documented BYPASSRLS connection.
CREATE OR REPLACE FUNCTION public.list_org_project_ids(p_org_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT id FROM public.projects WHERE organization_id = p_org_id;
$$;
REVOKE EXECUTE ON FUNCTION public.list_org_project_ids(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_org_project_ids(uuid) TO service_role;
