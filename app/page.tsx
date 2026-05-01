import { getProjectList } from '@/lib/graph/queries';
import { TopBar } from '@/components/layout/TopBar';
import { PageShell } from '@/components/layout/PageShell';
import { ProjectCard } from '@/components/home/ProjectCard';
import { NewProjectCard } from '@/components/home/NewProjectCard';
import { ContinueBanner } from '@/components/home/ContinueBanner';
import { AutoRefresh } from '@/components/home/AutoRefresh';

/** Force dynamic rendering — this page queries the database. */
export const dynamic = 'force-dynamic';

/**
 * Home page — project grid with real data from the database.
 * Shows empty state for fresh users, continue banner for active projects.
 * @returns Server-rendered project grid page.
 */
export default async function HomePage() {
  const projects = await getProjectList();
  const activeProject = projects.find((p) => p.status === 'active');

  return (
    <>
      <AutoRefresh />
      <TopBar />
      <PageShell>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-text-primary mb-1">
            Your Projects
          </h1>
          <p className="text-sm text-text-muted">
            Track projects created by your coding agent.
          </p>
        </div>

        {activeProject && (
          <ContinueBanner
            projectId={activeProject.id}
            projectName={activeProject.title}
            lastActiveNode={`${activeProject.taskStats.done}/${Math.max(activeProject.taskStats.total - activeProject.taskStats.cancelled, 0)} tasks done`}
            lastActive={activeProject.updatedAt.toLocaleDateString()}
          />
        )}

        {projects.length === 0 && (
          <div className="mb-6 rounded-xl border border-dashed border-border-strong/60 bg-surface-raised/40 p-6">
            <h2 className="mb-1 text-sm font-semibold text-text-primary">No projects yet</h2>
            <p className="text-xs leading-relaxed text-text-muted">
              Projects are created from your coding agent. Click <span className="font-medium text-text-secondary">New Project</span> below for install commands.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          <NewProjectCard hasProjects={projects.length > 0} />
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              identifier={project.identifier}
              title={project.title}
              description={project.description}
              status={project.status}
              tasksDone={project.taskStats.done}
              totalTasks={project.taskStats.total}
              cancelledTasks={project.taskStats.cancelled}
              tasksInProgress={project.taskStats.inProgress}
              lastActive={project.updatedAt.toLocaleDateString()}
            />
          ))}
        </div>
      </PageShell>
    </>
  );
}
