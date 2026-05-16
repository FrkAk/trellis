import { afterEach, describe, expect, test } from "bun:test";
import { truncateAll } from "@/tests/setup/schema";
import { serviceRoleConnect, seedUserOrgProject } from "@/tests/setup/seed";
import { expectQueryRejects } from "@/tests/setup/expect-query";

afterEach(async () => {
  await truncateAll();
});

// Tests connect as service_role (BYPASSRLS) to prove the triggers fire
// independently of RLS.
describe("immutability triggers — cross-team move prevented at DB level", () => {
  test("UPDATE projects SET organization_id = ... raises an exception", async () => {
    const a = await seedUserOrgProject("immut-a");
    const b = await seedUserOrgProject("immut-b");
    const sr = serviceRoleConnect();
    await expectQueryRejects(
      sr`UPDATE projects SET organization_id = ${b.organizationId}::uuid WHERE id = ${a.projectId}::uuid`,
      /projects\.organization_id is immutable/i,
    );
  });

  test("UPDATE projects SET title = ... still works (trigger only fires when org_id changes)", async () => {
    const fx = await seedUserOrgProject("immut-title-ok");
    const sr = serviceRoleConnect();
    try {
      await sr`UPDATE projects SET title = 'renamed' WHERE id = ${fx.projectId}::uuid`;
      const [row] = await sr<{ title: string }[]>`
        SELECT title FROM projects WHERE id = ${fx.projectId}::uuid
      `;
      expect(row.title).toBe("renamed");
    } finally {
      await sr.end({ timeout: 5 });
    }
  });

  test("UPDATE tasks SET project_id = ... raises an exception", async () => {
    const a = await seedUserOrgProject("immut-task-a");
    const b = await seedUserOrgProject("immut-task-b");
    const sr = serviceRoleConnect();
    let taskId: string;
    try {
      const [t] = await sr<{ id: string }[]>`
        INSERT INTO tasks (project_id, title, sequence_number)
        VALUES (${a.projectId}::uuid, 'task', 1)
        RETURNING id
      `;
      taskId = t.id;
    } finally {
      await sr.end({ timeout: 5 });
    }

    const sr2 = serviceRoleConnect();
    await expectQueryRejects(
      sr2`UPDATE tasks SET project_id = ${b.projectId}::uuid WHERE id = ${taskId}::uuid`,
      /tasks\.project_id is immutable/i,
    );
  });

  test("UPDATE tasks SET title = ... still works", async () => {
    const fx = await seedUserOrgProject("immut-task-title-ok");
    const sr = serviceRoleConnect();
    try {
      const [t] = await sr<{ id: string }[]>`
        INSERT INTO tasks (project_id, title, sequence_number)
        VALUES (${fx.projectId}::uuid, 'task', 1)
        RETURNING id
      `;
      await sr`UPDATE tasks SET title = 'renamed' WHERE id = ${t.id}::uuid`;
      const [row] = await sr<{ title: string }[]>`
        SELECT title FROM tasks WHERE id = ${t.id}::uuid
      `;
      expect(row.title).toBe("renamed");
    } finally {
      await sr.end({ timeout: 5 });
    }
  });
});
