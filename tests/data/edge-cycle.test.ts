import { afterEach, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as appSchema from "@/lib/db/schema";
import { truncateAll } from "@/tests/setup/schema";
import { seedUserOrgProject, serviceRoleConnect } from "@/tests/setup/seed";
import { getConnectionString } from "@/tests/setup/container";
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
type AppDbCache = ReturnType<typeof drizzle<typeof appSchema>>;

/**
 * Pin the application `db` Proxy to an `app_user`-bound Drizzle client for
 * the duration of `fn` so any module that imports `db` from `@/lib/db`
 * transparently runs under the non-BYPASSRLS role. Restores the previous
 * cache on exit. Mirrors `withAppUserDb` from `rls-dataring.test.ts`.
 *
 * @param fn - Callback to run with the swapped client.
 * @returns Whatever `fn` returns.
 */
async function withAppUserDb<T>(fn: () => Promise<T>): Promise<T> {
  const url = new URL(getConnectionString());
  url.username = "app_user";
  url.password = "app_user";
  const client = postgres(url.toString(), { max: 1 });
  const appUserDb = drizzle(client, { schema: appSchema });

  const g = globalThis as unknown as { __mymirAppDb: AppDbCache | undefined };
  const previous = g.__mymirAppDb;
  g.__mymirAppDb = appUserDb;
  try {
    return await fn();
  } finally {
    g.__mymirAppDb = previous;
    await client.end({ timeout: 5 });
  }
}

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
      withAppUserDb(() =>
        createEdge(ctx, {
          sourceTaskId: cId,
          targetTaskId: aId,
          edgeType: "depends_on",
          note: "",
        }),
      ),
    ).rejects.toThrow(/circular|cycle/i);
  });
});
