ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_acceptance_criteria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_assignees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_edges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_invite_code" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "projects_member_access" ON "projects" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
        SELECT 1 FROM neon_auth."member" m
        WHERE m."organizationId" = "projects"."organization_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM neon_auth."member" m
        WHERE m."organizationId" = "projects"."organization_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      ));--> statement-breakpoint
CREATE POLICY "task_acceptance_criteria_member_access" ON "task_acceptance_criteria" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE t.id = "task_acceptance_criteria"."task_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE t.id = "task_acceptance_criteria"."task_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      ));--> statement-breakpoint
CREATE POLICY "task_assignees_member_access" ON "task_assignees" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE t.id = "task_assignees"."task_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE t.id = "task_assignees"."task_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      ));--> statement-breakpoint
CREATE POLICY "task_decisions_member_access" ON "task_decisions" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE t.id = "task_decisions"."task_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE t.id = "task_decisions"."task_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      ));--> statement-breakpoint
CREATE POLICY "task_edges_member_access" ON "task_edges" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE t.id = "task_edges"."source_task_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE t.id = "task_edges"."source_task_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      ));--> statement-breakpoint
CREATE POLICY "task_links_member_access" ON "task_links" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE t.id = "task_links"."task_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE t.id = "task_links"."task_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      ));--> statement-breakpoint
CREATE POLICY "tasks_member_access" ON "tasks" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
        SELECT 1 FROM projects p
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE p.id = "tasks"."project_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM projects p
        JOIN neon_auth."member" m ON m."organizationId" = p.organization_id
        WHERE p.id = "tasks"."project_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      ));--> statement-breakpoint
CREATE POLICY "team_invite_code_member_access" ON "team_invite_code" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
        SELECT 1 FROM neon_auth."member" m
        WHERE m."organizationId" = "team_invite_code"."organization_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM neon_auth."member" m
        WHERE m."organizationId" = "team_invite_code"."organization_id"
          AND m."userId" = NULLIF(current_setting('app.user_id', TRUE), '')::uuid
      ));