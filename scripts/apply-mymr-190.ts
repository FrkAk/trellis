/**
 * One-shot migration applier for MYMR-190 against whatever DATABASE_URL
 * the env points at (Neon for prod, local Docker for dev).
 *
 * Runs ONLY MYMR-190's DDL plus the priority-tag → priority-column data
 * migration. Wrapped in a single transaction so partial failure rolls
 * back. Idempotent via `IF NOT EXISTS` and the WHERE filter on UPDATE.
 *
 * Usage: `bun run scripts/apply-mymr-190.ts`
 */
import { readFileSync, existsSync } from "node:fs";
import postgres from "postgres";

const envPath = ".env.local";
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const host = url.match(/@([^:/]+)/)?.[1] ?? "?";
console.log(`Target: ${host}`);

const sql = postgres(url, { max: 1, ssl: "require" });

try {
  await sql.begin(async (tx) => {
    console.log("1/4 ALTER TABLE tasks ADD COLUMN priority text");
    await tx.unsafe(`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "priority" text`);

    console.log("2/4 ALTER TABLE tasks ADD COLUMN estimate integer");
    await tx.unsafe(`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "estimate" integer`);

    console.log("3/4 CREATE TABLE task_assignees");
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS "task_assignees" (
          "task_id"    uuid NOT NULL,
          "user_id"    uuid NOT NULL,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL,
          CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id"),
          CONSTRAINT "task_assignees_task_id_tasks_id_fk"
              FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE,
          CONSTRAINT "task_assignees_user_id_user_id_fk"
              FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE
      )
    `);
    await tx.unsafe(
      `CREATE INDEX IF NOT EXISTS "task_assignees_user_id_idx" ON "task_assignees" USING btree ("user_id")`,
    );

    console.log("4/4 UPDATE tasks SET priority FROM tag (idempotent)");
    const updated = await tx.unsafe(`
      UPDATE "tasks"
         SET "priority" = CASE
             WHEN "tags" @> '["release-blocker"]'::jsonb THEN 'release-blocker'
             WHEN "tags" @> '["core"]'::jsonb            THEN 'core'
             WHEN "tags" @> '["normal"]'::jsonb          THEN 'normal'
             WHEN "tags" @> '["backlog"]'::jsonb         THEN 'backlog'
         END
       WHERE "priority" IS NULL
         AND ("tags" @> '["release-blocker"]'::jsonb
           OR "tags" @> '["core"]'::jsonb
           OR "tags" @> '["normal"]'::jsonb
           OR "tags" @> '["backlog"]'::jsonb)
       RETURNING id
    `);
    console.log(`   ${updated.length} task(s) updated`);
  });

  const distribution = await sql<{ priority: string | null; n: bigint }[]>`
    SELECT priority, COUNT(*)::int AS n FROM tasks GROUP BY priority ORDER BY priority NULLS LAST
  `;
  console.log("Final priority distribution:");
  for (const row of distribution) {
    console.log(`  ${row.priority ?? "(null)"}: ${row.n}`);
  }

  console.log("Done.");
} catch (e) {
  console.error("FAILED:", e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
