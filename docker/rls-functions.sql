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
-- LANGUAGE plpgsql is used on every SECURITY DEFINER body so the planner
-- cannot inline them. Inlining has historically changed effective privileges
-- around SECURITY DEFINER (CVE-2022-1552 class); plpgsql is never inlined.
--
-- Every function pins search_path with `pg_temp` appended last
-- (CVE-2018-1058 class). Postgres implicitly searches pg_temp first
-- unless explicitly listed; putting it last forces attacker-injected
-- temp objects to resolve only after the trusted schemas.
--
-- KEEP IN SYNC WITH:
--   lib/data/team-invite-code.ts (JS callers)
--   docs/neon-prod-provisioning.sql section 9 (prod runbook pointer)
-- ---------------------------------------------------------------------------

-- Returns only the four diagnostic fields. Withholding id /
-- organization_id / default_role prevents a guessed code from resolving
-- to a real org on a diagnose miss.
CREATE OR REPLACE FUNCTION public.lookup_team_invite_code(p_code text)
RETURNS TABLE (
  revoked_at timestamptz,
  expires_at timestamptz,
  max_uses integer,
  use_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT t.revoked_at, t.expires_at, t.max_uses, t.use_count
  FROM public.team_invite_code t
  WHERE t.code = p_code
  LIMIT 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lookup_team_invite_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_team_invite_code(text) TO app_user;

-- Atomically reserve a slot on a valid, non-revoked, non-expired,
-- non-exhausted code. Records `reserved_by = p_user_id` so the matching
-- `release_team_invite_code_slot` call can confirm it's the same caller
-- before mutating the slot (H1 binding check). Returns the row
-- identifiers on success, empty set on failure (anti-enumeration —
-- caller cannot distinguish failure reasons).
--
-- Pre-sweep: an unreleased reservation older than its `reserved_until`
-- gets its slot reclaimed (use_count decremented, reserved_until +
-- reserved_by cleared) before the new attempt is evaluated. This handles
-- the crash-between-reserve-and-release case (OOM, SIGTERM). The sweep
-- is scoped to the row being attempted, so unrelated codes are not
-- touched.
--
-- This SDF does NOT read `app.user_id` from the GUC — the caller's
-- identity is passed explicitly so the SDF is safe to call on the bare
-- pool (no withUserContext wrapper required). Trust boundary: the JS
-- action verifies `session.user.id` before invoking, identical to the
-- contract of `auth.api.addMember`.
DROP FUNCTION IF EXISTS public.reserve_team_invite_code_slot(text);
CREATE OR REPLACE FUNCTION public.reserve_team_invite_code_slot(p_code text, p_user_id uuid)
RETURNS TABLE (id uuid, organization_id uuid, default_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE public.team_invite_code AS t
     SET use_count = GREATEST(t.use_count - 1, 0),
         reserved_until = NULL,
         reserved_by = NULL,
         updated_at = NOW()
   WHERE t.code = p_code
     AND t.reserved_until IS NOT NULL
     AND t.reserved_until < NOW();

  RETURN QUERY
  UPDATE public.team_invite_code AS t
     SET use_count = t.use_count + 1,
         reserved_until = NOW() + interval '15 minutes',
         reserved_by = p_user_id,
         updated_at = NOW()
   WHERE t.code = p_code
     AND t.revoked_at IS NULL
     AND (t.expires_at IS NULL OR t.expires_at > NOW())
     AND (t.max_uses IS NULL OR t.use_count < t.max_uses)
  RETURNING t.id, t.organization_id, t.default_role;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reserve_team_invite_code_slot(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reserve_team_invite_code_slot(text, uuid) TO app_user;

-- Finalize a reservation. The caller passes the explicit outcome
-- (`p_succeeded`) — the SDF no longer infers it from DB state, which
-- closes the `already_member` mis-finalize hole (the JS layer is the
-- only place that can tell "this saga created the member row" from
-- "caller was already a member of this org before reserve").
--
-- Gates on `reserved_by = p_user_id` so an attacker who learns a row's
-- UUID (log leak, debugger trace) cannot release someone else's
-- reservation. Mismatches match zero rows and return false; the JS
-- caller logs and moves on.
--
-- Outcomes:
--   p_succeeded = true  → keep use_count, clear reserved_until + reserved_by.
--   p_succeeded = false → decrement use_count (floored at 0), clear both.
--
-- Returns: true when an authorized row was updated, false otherwise.
-- This SDF does NOT read `app.user_id`.
DROP FUNCTION IF EXISTS public.release_team_invite_code_slot(uuid);
CREATE OR REPLACE FUNCTION public.release_team_invite_code_slot(
  p_id uuid,
  p_user_id uuid,
  p_succeeded boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_matched integer;
BEGIN
  UPDATE public.team_invite_code AS t
     SET use_count = CASE
           WHEN p_succeeded THEN t.use_count
           ELSE GREATEST(t.use_count - 1, 0)
         END,
         reserved_until = NULL,
         reserved_by = NULL,
         updated_at = NOW()
   WHERE t.id = p_id
     AND t.reserved_by = p_user_id;
  GET DIAGNOSTICS v_matched = ROW_COUNT;
  RETURN v_matched = 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.release_team_invite_code_slot(uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.release_team_invite_code_slot(uuid, uuid, boolean) TO app_user;

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id FROM public.projects p WHERE p.organization_id = p_org_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_org_project_ids(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_org_project_ids(uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- current_user_* helpers — the only path app_user has to neon_auth.*.
--
-- STABLE plpgsql bodies. Postgres still memoizes STABLE function calls used
-- inside WHERE / ANY constructs once per query plan. search_path is pinned
-- so a hostile caller cannot shadow neon_auth.* by setting a local
-- search_path.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      array_agg("organizationId") FILTER (WHERE "organizationId" IS NOT NULL),
      ARRAY[]::uuid[]
    )
    FROM neon_auth."member"
    WHERE "userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_org_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_org_ids() TO app_user;

CREATE OR REPLACE FUNCTION public.current_user_org_role(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM neon_auth."member"
  WHERE "organizationId" = p_org_id
    AND "userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
  LIMIT 1;
  RETURN v_role;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_org_role(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_org_role(uuid) TO app_user;

-- member_count is correlated so the team-list UI gets it in one roundtrip
-- instead of issuing a second aggregation query.
CREATE OR REPLACE FUNCTION public.current_user_orgs()
RETURNS TABLE (
  org_id uuid,
  name text,
  slug text,
  member_role text,
  member_count integer,
  member_created_at timestamptz,
  org_created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    m.role,
    (SELECT count(*)::int FROM neon_auth."member" mc WHERE mc."organizationId" = o.id) AS member_count,
    m."createdAt",
    o."createdAt"
  FROM neon_auth."member" m
  INNER JOIN neon_auth."organization" o ON o.id = m."organizationId"
  WHERE m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
  ORDER BY m."createdAt" ASC, o.id ASC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_orgs() FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_orgs() TO app_user;

CREATE OR REPLACE FUNCTION public.current_user_has_any_membership()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM neon_auth."member"
    WHERE "userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_has_any_membership() FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_has_any_membership() TO app_user;

-- Returns NULL on both "doesn't exist" and "exists but cross-team", so
-- callers cannot distinguish them (anti-enumeration).
CREATE OR REPLACE FUNCTION public.current_user_visible_member(p_member_id uuid)
RETURNS TABLE (id uuid, role text, organization_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.role, m."organizationId"
  FROM neon_auth."member" m
  WHERE m.id = p_member_id
    AND EXISTS (
      SELECT 1
      FROM neon_auth."member" caller
      WHERE caller."organizationId" = m."organizationId"
        AND caller."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
    )
  LIMIT 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_visible_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_visible_member(uuid) TO app_user;

CREATE OR REPLACE FUNCTION public.team_member_roles_visible(p_org_id uuid)
RETURNS TABLE (role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT m.role
  FROM neon_auth."member" m
  WHERE m."organizationId" = p_org_id
    AND EXISTS (
      SELECT 1
      FROM neon_auth."member" caller
      WHERE caller."organizationId" = p_org_id
        AND caller."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.team_member_roles_visible(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.team_member_roles_visible(uuid) TO app_user;

CREATE OR REPLACE FUNCTION public.team_members_visible(p_org_id uuid)
RETURNS TABLE (
  member_id uuid,
  user_id uuid,
  role text,
  name text,
  email text,
  member_created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m."userId", m.role, u.name, u.email, m."createdAt"
  FROM neon_auth."member" m
  INNER JOIN neon_auth."user" u ON u.id = m."userId"
  WHERE m."organizationId" = p_org_id
    AND EXISTS (
      SELECT 1
      FROM neon_auth."member" caller
      WHERE caller."organizationId" = p_org_id
        AND caller."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
    )
  ORDER BY m."createdAt" ASC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.team_members_visible(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.team_members_visible(uuid) TO app_user;

-- Body gates on admin/owner role; regular members get zero rows.
CREATE OR REPLACE FUNCTION public.team_invitations_visible(p_org_id uuid)
RETURNS TABLE (
  invitation_id uuid,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  inviter_id uuid,
  inviter_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT i.id, i.email, i.role, i.status, i."expiresAt", i."createdAt",
         i."inviterId", u.name
  FROM neon_auth.invitation i
  LEFT JOIN neon_auth."user" u ON u.id = i."inviterId"
  WHERE i."organizationId" = p_org_id
    AND EXISTS (
      SELECT 1
      FROM neon_auth."member" caller
      WHERE caller."organizationId" = p_org_id
        AND caller."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
        AND caller.role IN ('admin', 'owner')
    )
  ORDER BY i."createdAt" DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.team_invitations_visible(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.team_invitations_visible(uuid) TO app_user;

-- Non-shared users are filtered out so the caller cannot probe arbitrary
-- uuids for existence.
CREATE OR REPLACE FUNCTION public.lookup_user_names_in_shared_orgs(p_user_ids uuid[])
RETURNS TABLE (id uuid, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.name
  FROM neon_auth."user" u
  WHERE u.id = ANY (p_user_ids)
    AND EXISTS (
      SELECT 1
      FROM neon_auth."member" m1
      INNER JOIN neon_auth."member" m2
        ON m2."organizationId" = m1."organizationId"
      WHERE m1."userId" = u.id
        AND m2."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lookup_user_names_in_shared_orgs(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_user_names_in_shared_orgs(uuid[]) TO app_user;

-- Returns assignees of a task to a caller who is a member of the task's
-- org. Replaces an inline `JOIN neon_auth."user"` in `getTaskFull` (which
-- app_user cannot run under the Option-B lockdown). Caller membership is
-- re-checked inside the function so upstream regressions cannot leak
-- assignee identity cross-team.
CREATE OR REPLACE FUNCTION public.task_assignees_visible(p_task_id uuid)
RETURNS TABLE (user_id uuid, name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT ta.user_id, u.name, u.email
  FROM public.task_assignees ta
  INNER JOIN neon_auth."user" u ON u.id = ta.user_id
  WHERE ta.task_id = p_task_id
    AND EXISTS (
      SELECT 1
      FROM public.tasks t
      INNER JOIN public.projects pj ON pj.id = t.project_id
      INNER JOIN neon_auth."member" caller
        ON caller."organizationId" = pj.organization_id
      WHERE t.id = p_task_id
        AND caller."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
    )
  ORDER BY u.name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.task_assignees_visible(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.task_assignees_visible(uuid) TO app_user;

-- Validates that every supplied user id is a member of the given org.
-- Returns the subset that ARE members; the TS caller derives the missing
-- set. Used by assignee writes to fail-fast before inserting orphan rows.
-- Caller-membership self-check keeps the function from leaking membership
-- of foreign orgs.
CREATE OR REPLACE FUNCTION public.org_member_user_ids_visible(
  p_org_id uuid,
  p_user_ids uuid[]
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT m."userId"
  FROM neon_auth."member" m
  WHERE m."organizationId" = p_org_id
    AND m."userId" = ANY (p_user_ids)
    AND EXISTS (
      SELECT 1
      FROM neon_auth."member" caller
      WHERE caller."organizationId" = p_org_id
        AND caller."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.org_member_user_ids_visible(uuid, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.org_member_user_ids_visible(uuid, uuid[]) TO app_user;

-- Returns the invitation's organization_id only when the caller is a
-- member of that org. NULL on miss or cross-org probe — anti-enumeration.
-- Used by the cancel-invite action to scope its admin check.
CREATE OR REPLACE FUNCTION public.lookup_invitation_org_id(p_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT i."organizationId" INTO v_org_id
  FROM neon_auth.invitation i
  WHERE i.id = p_invitation_id
    AND EXISTS (
      SELECT 1
      FROM neon_auth."member" caller
      WHERE caller."organizationId" = i."organizationId"
        AND caller."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
    );
  RETURN v_org_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lookup_invitation_org_id(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_invitation_org_id(uuid) TO app_user;

-- ---------------------------------------------------------------------------
-- Immutability triggers — block cross-team moves at the DB level.
-- RLS WITH CHECK passes when a dual-org member is in both source and
-- target, so the trigger rejects the column change independent of RLS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_projects_organization_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION
      'projects.organization_id is immutable — cross-team project moves are forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_organization_id_immutable ON public.projects;
CREATE TRIGGER projects_organization_id_immutable
  BEFORE UPDATE OF organization_id ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_projects_organization_id_change();

CREATE OR REPLACE FUNCTION public.reject_tasks_project_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION
      'tasks.project_id is immutable — cross-team task moves are forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_project_id_immutable ON public.tasks;
CREATE TRIGGER tasks_project_id_immutable
  BEFORE UPDATE OF project_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_tasks_project_id_change();

-- service_role only. The org-delete hook iterates members after the org
-- row is queued for deletion, so a user-scoped lookup races the cascade.
CREATE OR REPLACE FUNCTION public.find_org_member_user_ids_as_admin(p_org_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = neon_auth, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT m."userId" FROM neon_auth."member" m WHERE m."organizationId" = p_org_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.find_org_member_user_ids_as_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.find_org_member_user_ids_as_admin(uuid) TO service_role;
