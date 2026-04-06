'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, tasks } from '@/lib/db/schema';
import type { ProjectStatus } from '@/lib/types';

/**
 * Update a project's status.
 * @param projectId - UUID of the project.
 * @param status - New project status.
 * @returns The updated project row.
 */
export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  const [updated] = await db
    .update(projects)
    .set({ status, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning();
  return updated;
}

/**
 * Get a project's status and task count for phase validation.
 * @param projectId - UUID of the project.
 * @returns Project status and task count, or null if not found.
 */
export async function getProjectPhaseInfo(projectId: string) {
  const [project] = await db
    .select({ id: projects.id, status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return null;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  return { status: project.status as ProjectStatus, taskCount: countRow?.count ?? 0 };
}
