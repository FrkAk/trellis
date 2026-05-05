/**
 * Smoke verification for MYMR-158 — `core.updateProject` mass-assignment closure.
 *
 * Exercises the four security-critical behaviors of `core.updateProject` against
 * a real Postgres instance:
 *
 *   1. Identifier reject — passing `{ identifier: ... }` throws
 *      `InsufficientRoleError`. Forces callers to use `renameProjectIdentifier`,
 *      which holds the per-org advisory lock and gates on the `rename` action.
 *   2. organizationId strip — passing `{ organizationId: <other-team> }` does NOT
 *      rehome the project. The `organization_id` column is unchanged after the call.
 *   3. history strip — passing `{ history: [...] }` does NOT overwrite the
 *      audit trail. The `history` jsonb column is unchanged after the call.
 *   4. Positive control — passing `{ title: 'X' }` succeeds and writes title.
 *
 * Setup (manual; the script does not seed):
 *   1. `bun run dev` (the script connects to the same DATABASE_URL).
 *   2. Identify a project P in a team A where one of your test users is a
 *      plain member (not admin/owner). Note `SMOKE_PROJECT_ID`.
 *   3. Note the `SMOKE_MEMBER_USER_ID` for that user (Better Auth `user.id`,
 *      not the email).
 *   4. Identify any other team B the member user does NOT belong to. Note
 *      `SMOKE_VICTIM_ORG_ID`.
 *
 * Run:
 *   DATABASE_URL=<dev-db-url> \
 *   SMOKE_PROJECT_ID=<uuid> \
 *   SMOKE_MEMBER_USER_ID=<uuid> \
 *   SMOKE_VICTIM_ORG_ID=<uuid> \
 *     bun run scripts/smoke-mymr-158.ts
 *
 * Exit code: 0 on all-pass, 1 on any failure. Each row prints `PASS` or `FAIL`
 * with the reason. The positive control reverts the title back to its original
 * value at the end so the script is idempotent on success.
 *
 * What this script does NOT cover: the MCP and web server-action wrappers.
 * Both call into `core.updateProject` directly, so closing the core function
 * is sufficient for the mass-assignment surface; the wrappers' RBAC behavior
 * for identifier renames is verified end-to-end via the live dev server in
 * the PR description.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { makeAuthContext } from "@/lib/auth/context";
import { updateProject } from "@/lib/graph/_core/mutations";
import { InsufficientRoleError } from "@/lib/auth/authorization";

type Outcome = { row: string; pass: boolean; detail: string };

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
  return value;
}

async function loadProjectSnapshot(projectId: string) {
  const [row] = await db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      identifier: projects.identifier,
      title: projects.title,
      history: projects.history,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!row) {
    console.error(`Project ${projectId} not found in DB.`);
    process.exit(2);
  }
  return row;
}

async function main() {
  const projectId = readEnv("SMOKE_PROJECT_ID");
  const memberUserId = readEnv("SMOKE_MEMBER_USER_ID");
  const victimOrgId = readEnv("SMOKE_VICTIM_ORG_ID");

  const before = await loadProjectSnapshot(projectId);
  const memberCtx = makeAuthContext(memberUserId);
  const results: Outcome[] = [];

  // Row 1 — identifier reject
  try {
    await updateProject(memberCtx, projectId, {
      identifier: "PWND",
    } as unknown as Parameters<typeof updateProject>[2]);
    results.push({
      row: "1. identifier reject",
      pass: false,
      detail: "expected InsufficientRoleError; call returned without throwing",
    });
  } catch (err) {
    if (err instanceof InsufficientRoleError) {
      results.push({
        row: "1. identifier reject",
        pass: true,
        detail: `threw InsufficientRoleError(actions=[${err.requiredActions.join(",")}])`,
      });
    } else {
      results.push({
        row: "1. identifier reject",
        pass: false,
        detail: `wrong error type: ${(err as Error).name}: ${(err as Error).message}`,
      });
    }
  }

  // Row 2 — organizationId strip
  await updateProject(memberCtx, projectId, {
    organizationId: victimOrgId,
  } as unknown as Parameters<typeof updateProject>[2]);
  const afterOrg = await loadProjectSnapshot(projectId);
  results.push({
    row: "2. organizationId strip",
    pass: afterOrg.organizationId === before.organizationId,
    detail:
      afterOrg.organizationId === before.organizationId
        ? `organization_id unchanged (${afterOrg.organizationId})`
        : `TENANT REHOME: ${before.organizationId} → ${afterOrg.organizationId}`,
  });

  // Row 3 — history strip
  const forgedHistory = [
    {
      id: "00000000-0000-0000-0000-000000000000",
      date: new Date().toISOString(),
      type: "renamed",
      actor: "system",
      label: "smoke",
      description: "smoke",
    },
  ];
  await updateProject(memberCtx, projectId, {
    history: forgedHistory,
  } as unknown as Parameters<typeof updateProject>[2]);
  const afterHistory = await loadProjectSnapshot(projectId);
  const historyUnchanged =
    JSON.stringify(afterHistory.history) === JSON.stringify(before.history);
  results.push({
    row: "3. history strip",
    pass: historyUnchanged,
    detail: historyUnchanged
      ? `history unchanged (${afterHistory.history.length} entries)`
      : `HISTORY OVERWRITTEN: ${before.history.length} → ${afterHistory.history.length} entries`,
  });

  // Row 4 — positive control: title write
  const probeTitle = `smoke-${Date.now()}`;
  const updated = await updateProject(memberCtx, projectId, {
    title: probeTitle,
  });
  const titleWritten = updated?.title === probeTitle;
  // Revert immediately so the script is idempotent on success.
  if (titleWritten) {
    await updateProject(memberCtx, projectId, { title: before.title });
  }
  results.push({
    row: "4. positive control (title write)",
    pass: titleWritten,
    detail: titleWritten
      ? `title written and reverted to '${before.title}'`
      : `title NOT written (got '${updated?.title}')`,
  });

  // Report
  const allPass = results.every((r) => r.pass);
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.row}: ${r.detail}`);
  }
  console.log(allPass ? "\nAll rows passed." : "\nFailures detected.");
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
