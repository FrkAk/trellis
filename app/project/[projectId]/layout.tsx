import { type ReactNode } from 'react';
import { getProject } from '@/lib/graph/queries';
import { WorkspaceHeader } from '@/components/workspace/WorkspaceHeader';
import { notFound, redirect } from 'next/navigation';

interface LayoutProps {
  /** @param children - Page content. */
  children: ReactNode;
  /** @param params - Route params with projectId. */
  params: Promise<{ projectId: string }>;
}

/**
 * Project workspace layout with TopBar showing project name and stats.
 * @param props - Layout props with children and route params.
 * @returns Layout with TopBar and content area.
 */
export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }
  if (project.status === 'brainstorming' || project.status === 'decomposing') {
    redirect('/');
  }

  const doneCount = project.tasks.filter((t) => t.status === 'done').length;
  const totalCount = project.tasks.length;
  const cancelledCount = project.tasks.filter((t) => t.status === 'cancelled').length;
  const activeCount = Math.max(totalCount - cancelledCount, 0);

  return (
    <>
      <WorkspaceHeader
        projectId={projectId}
        projectName={project.title}
        description={project.description}
        identifier={project.identifier}
        status={project.status}
        categories={project.categories}
        taskCount={totalCount}
        stageLabel={`${totalCount} tasks`}
        taskStats={`${doneCount}/${activeCount} tasks done${cancelledCount > 0 ? `, ${cancelledCount} cancelled` : ''}`}
      />
      <div className="pt-[var(--topbar-h)]">
        {children}
      </div>
    </>
  );
}
