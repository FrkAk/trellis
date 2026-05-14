/**
 * One-shot apply script for MYMR-136. Runs the splice-edited
 * `drizzle/0001_<slug>.sql` migration directly against `DATABASE_URL`,
 * splitting on `--> statement-breakpoint` so each statement (including the
 * backfill INSERTs and the parity-assertion DO block) runs in order.
 *
 * Why not `drizzle-kit migrate`? It does work, but spawning a fresh
 * process and re-parsing the config every invocation hides the per-row
 * counts during the assertion. This script prints the final counts so
 * the operator can visually confirm `src = dst` on production.
 *
 * Why not `db:push`? It bypasses the migrations directory, which means
 * the hand-spliced backfill never runs.
 *
 * After Neon production is migrated and the assertion is observed
 * passing, a follow-up cleanup commit removes this script — same
 * "verification served its purpose" pattern as the MYMR-69 RBAC smoke
 * matrix.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required. Set it to the Neon connection string.");
  process.exit(1);
}

const dir = join(process.cwd(), "drizzle");
const migrationFile = readdirSync(dir).find((f) =>
  /^0001_.*\.sql$/.test(f),
);
if (!migrationFile) {
  console.error("Could not find drizzle/0001_*.sql in the migrations directory.");
  process.exit(1);
}

const path = join(dir, migrationFile);
const sql = readFileSync(path, "utf8");
const statements = sql
  .split(/--> statement-breakpoint\s*/g)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Applying ${migrationFile} (${statements.length} statements) to ${url.split("@").pop()}`);

const client = postgres(url, { max: 1 });
try {
  await client.begin(async (tx) => {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.split("\n")[0].slice(0, 80);
      process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);
      await tx.unsafe(stmt);
      process.stdout.write("OK\n");
    }
  });

  const [{ ac, dec }] = await client<{ ac: string; dec: string }[]>`
    SELECT
      (SELECT COUNT(*)::text FROM task_acceptance_criteria) AS ac,
      (SELECT COUNT(*)::text FROM task_decisions) AS dec
  `;
  console.log(`\nMigration complete. task_acceptance_criteria=${ac} rows, task_decisions=${dec} rows.`);
} finally {
  await client.end({ timeout: 5 });
}
