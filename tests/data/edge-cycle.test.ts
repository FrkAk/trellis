import { afterEach, describe, expect, test } from "bun:test";
import { truncateAll } from "@/tests/setup/schema";
import { seedUserOrgProject, serviceRoleConnect } from "@/tests/setup/seed";
import { makeAuthContext } from "@/lib/auth/context";
import { createEdge } from "@/lib/data/edge";

/**
 * Regression test for the cycle-detection bypass: under app_user, the
 * `getDependencyChain` call in `createEdge`/`updateEdge` used to default to
 * the bare `db` client with no `app.user_id` GUC set, so the recursive CTE
 * returned `[]` and `wouldCycle` was always `false`. This let any caller
 * stitch a `depends_on` cycle without detection.
 *
 * The fix moves the cycle check inside the `withUserContext` block and
 * uses `fetchDependencyChain(tx, ...)` directly so the recursive walk
 * participates in the same RLS-scoped transaction frame.
 */

afterEach(async () => {
  await truncateAll();
});

describe("createEdge cycle detection under app_user", () => {
  test("rejects creating an edge that would form a depends_on cycle", async () => {
    const fx = await seedUserOrgProject("cycle-1");
    const sr = serviceRoleConnect();
    let aId: string;
    let cId: string;
    try {
      const [a] = await sr<{ id: string }[]>`
        INSERT INTO tasks (project_id, title, sequence_number)
        VALUES (${fx.projectId}, 'A', 1) RETURNING id`;
      const [b] = await sr<{ id: string }[]>`
        INSERT INTO tasks (project_id, title, sequence_number)
        VALUES (${fx.projectId}, 'B', 2) RETURNING id`;
      const [c] = await sr<{ id: string }[]>`
        INSERT INTO tasks (project_id, title, sequence_number)
        VALUES (${fx.projectId}, 'C', 3) RETURNING id`;
      await sr`INSERT INTO task_edges (source_task_id, target_task_id, edge_type)
               VALUES (${a.id}, ${b.id}, 'depends_on')`;
      await sr`INSERT INTO task_edges (source_task_id, target_task_id, edge_type)
               VALUES (${b.id}, ${c.id}, 'depends_on')`;
      aId = a.id;
      cId = c.id;
    } finally {
      await sr.end({ timeout: 5 });
    }

    const ctx = makeAuthContext(fx.userId);
    await expect(
      createEdge(ctx, {
        sourceTaskId: cId,
        targetTaskId: aId,
        edgeType: "depends_on",
        note: "",
      }),
    ).rejects.toThrow(/circular|cycle/i);
  });
});
