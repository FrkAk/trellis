import { type ReactNode } from 'react';
import { getProject } from '@/lib/graph/queries';
import { TopBar } from '@/components/layout/TopBar';
import { notFound } from 'next/navigation';

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

  const doneCount = project.tasks.filter((t) => t.status === 'done').length;
  const totalCount = project.tasks.length;

  return (
    <>
      <TopBar
        projectName={project.title}
        stageLabel={`${totalCount} tasks`}
        taskStats={`${doneCount}/${totalCount} tasks done`}
      />
      <div className="pt-[var(--topbar-h)]">
        {children}
      </div>
    </>
  );
}
