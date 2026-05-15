-- ---------------------------------------------------------------------------
-- Row-Level Security policies for public-schema tables.
-- ---------------------------------------------------------------------------
--
-- Applied after `bun run db:push` because every policy references public
-- tables that push must create first. Tables get RLS enabled via
-- `.enableRLS()` in the Drizzle schema; this file adds the `CREATE POLICY`
-- predicates that drizzle-kit push cannot generate (its introspection-based
-- diff drops the USING/WITH CHECK clauses on pgPolicy() declarations).
--
-- Idempotent: each `DROP POLICY IF EXISTS` + `CREATE POLICY` pair re-applies
-- cleanly on every db:setup re-run.
--
-- Design notes:
--   * Each policy is one permissive FOR ALL TO public predicate joining
--     `neon_auth.member` on the GUC `app.user_id`.
--   * The GUC lookup is wrapped in (SELECT ...) so Postgres emits an
--     InitPlan node — evaluated once per statement, not once per row.
--   * `NULLIF(current_setting(...), '')::uuid` resolves to NULL on the
--     missing-GUC path so the EXISTS subquery defaults to false (deny).
--   * WITH CHECK is omitted on policies where it would equal USING —
--     Postgres reuses USING in that case.
--   * `task_edges` is the exception: USING checks source endpoint (so
--     same-team reads work); WITH CHECK validates BOTH source AND target
--     so a user cannot create or update an edge into another team's task.
--   * service_role (BYPASSRLS) sidesteps every policy without role-targeted
--     exclusion; app_user evaluates them on every query.

-- projects — 1-hop
DROP POLICY IF EXISTS "projects_member_access" ON "projects";
CREATE POLICY "projects_member_access" ON "projects" AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM neon_auth."member" m
    WHERE m."organizationId" = "projects"."organization_id"
      AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
  ));

-- tasks — 2-hop via projects.organization_id
DROP POLICY IF EXISTS "tasks_member_access" ON "tasks";
CREATE POLICY "tasks_member_access" ON "tasks" AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
    WHERE p.id = "tasks"."project_id"
      AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
  ));

-- task_edges — USING is source-only (read scoping); WITH CHECK validates BOTH
-- endpoints belong to a team the caller is a member of.
DROP POLICY IF EXISTS "task_edges_member_access" ON "task_edges";
CREATE POLICY "task_edges_member_access" ON "task_edges" AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
    JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
    WHERE t.id = "task_edges"."source_task_id"
      AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
  ))
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
      WHERE t.id = "task_edges"."source_task_id"
        AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
    )
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.projects p ON p.id = t.project_id
      JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
      WHERE t.id = "task_edges"."target_task_id"
        AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
    )
  );

-- task_assignees — 3-hop via task → projects
DROP POLICY IF EXISTS "task_assignees_member_access" ON "task_assignees";
CREATE POLICY "task_assignees_member_access" ON "task_assignees" AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
    JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
    WHERE t.id = "task_assignees"."task_id"
      AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
  ));

-- task_acceptance_criteria — 3-hop via task → projects
DROP POLICY IF EXISTS "task_acceptance_criteria_member_access" ON "task_acceptance_criteria";
CREATE POLICY "task_acceptance_criteria_member_access" ON "task_acceptance_criteria" AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
    JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
    WHERE t.id = "task_acceptance_criteria"."task_id"
      AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
  ));

-- task_decisions — 3-hop via task → projects
DROP POLICY IF EXISTS "task_decisions_member_access" ON "task_decisions";
CREATE POLICY "task_decisions_member_access" ON "task_decisions" AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
    JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
    WHERE t.id = "task_decisions"."task_id"
      AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
  ));

-- task_links — 3-hop via task → projects
DROP POLICY IF EXISTS "task_links_member_access" ON "task_links";
CREATE POLICY "task_links_member_access" ON "task_links" AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.projects p ON p.id = t.project_id
    JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
    WHERE t.id = "task_links"."task_id"
      AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
  ));

-- team_invite_code — split: SELECT for all members of the org, writes
-- (INSERT/UPDATE/DELETE) restricted to admin/owner roles. Defense-in-depth
-- so a bypass of the action-layer isOrgAdmin check (new endpoint, SQLi
-- landing) cannot mint or rotate codes from a regular member's session.
DROP POLICY IF EXISTS "team_invite_code_member_access" ON "team_invite_code";
DROP POLICY IF EXISTS "team_invite_code_member_select" ON "team_invite_code";
DROP POLICY IF EXISTS "team_invite_code_admin_write" ON "team_invite_code";

CREATE POLICY "team_invite_code_member_select" ON "team_invite_code"
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM neon_auth."member" m
    WHERE m."organizationId" = "team_invite_code"."organization_id"
      AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
  ));

CREATE POLICY "team_invite_code_admin_write" ON "team_invite_code"
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM neon_auth."member" m
    WHERE m."organizationId" = "team_invite_code"."organization_id"
      AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
      AND m."role" IN ('admin','owner')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM neon_auth."member" m
    WHERE m."organizationId" = "team_invite_code"."organization_id"
      AND m."userId" = (SELECT NULLIF(current_setting('app.user_id', TRUE), '')::uuid)
      AND m."role" IN ('admin','owner')
  ));

-- WITH CHECK is explicit (not implicit-from-USING) so the INSERT-time policy
-- evaluation is unambiguous to readers and future Postgres versions can't
-- regress the behavior by tightening the implicit-reuse rule.
