import { test, expect, afterEach } from "bun:test";
import postgres from "postgres";
import { truncateAll } from "@/tests/setup/schema";
import { getConnectionString } from "@/tests/setup/container";
import { seedUserOrgProject } from "@/tests/setup/seed";
import { listMembershipsWithCounts } from "@/lib/data/membership";

afterEach(async () => {
  await truncateAll();
});

test("listMembershipsWithCounts paginates by (createdAt, id) cursor", async () => {
  // Seed 1 user with 6 organizations (all owner-membership)
  const base = await seedUserOrgProject("memberpage");

  const sqlc = postgres(getConnectionString(), { max: 1 });
  try {
    for (let i = 0; i < 5; i++) {
      const [o] = await sqlc<{ id: string }[]>`
        INSERT INTO neon_auth."organization" ("name", "slug", "createdAt")
        VALUES (${"Extra " + i}, ${"extra-" + i}, ${new Date(Date.now() + (i + 1) * 1000)})
        RETURNING id
      `;
      await sqlc`
        INSERT INTO neon_auth."member" ("organizationId", "userId", "role", "createdAt")
        VALUES (${o.id}, ${base.userId}, 'owner', now())
      `;
    }
  } finally {
    await sqlc.end({ timeout: 5 });
  }

  const page1 = await listMembershipsWithCounts(base.userId, { limit: 3 });
  expect(page1.memberships.length).toBe(3);
  expect(page1.nextCursor).not.toBeNull();

  const page2 = await listMembershipsWithCounts(base.userId, {
    limit: 3,
    cursor: page1.nextCursor,
  });
  expect(page2.memberships.length).toBe(3);
  expect(page2.nextCursor).toBeNull();

  const ids1 = new Set(page1.memberships.map((m) => m.organizationId));
  const ids2 = new Set(page2.memberships.map((m) => m.organizationId));
  for (const id of ids2) expect(ids1.has(id)).toBe(false);
  expect(ids1.size + ids2.size).toBe(6);
});
