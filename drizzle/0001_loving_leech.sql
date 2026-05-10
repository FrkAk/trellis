CREATE TABLE "task_assignees" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "estimate" integer;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_assignees_user_id_idx" ON "task_assignees" USING btree ("user_id");--> statement-breakpoint
-- MYMR-190: copy priority tags into the new priority column. Idempotent
-- (the WHERE filter skips already-populated rows). The matching tag
-- strings INTENTIONALLY stay in `tasks.tags` so other branches that
-- still read priority from `tags` keep working during the dual-life
-- period. A follow-up migration will strip them after the old code
-- paths are gone.
UPDATE "tasks"
   SET "priority" =
       CASE
         WHEN "tags" @> '["release-blocker"]'::jsonb THEN 'release-blocker'
         WHEN "tags" @> '["core"]'::jsonb            THEN 'core'
         WHEN "tags" @> '["normal"]'::jsonb          THEN 'normal'
         WHEN "tags" @> '["backlog"]'::jsonb         THEN 'backlog'
       END
 WHERE "priority" IS NULL
   AND ("tags" @> '["release-blocker"]'::jsonb
     OR "tags" @> '["core"]'::jsonb
     OR "tags" @> '["normal"]'::jsonb
     OR "tags" @> '["backlog"]'::jsonb);