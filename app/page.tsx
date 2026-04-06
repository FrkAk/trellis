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
        <h1 className="font-display text-3xl font-bold text-gradient mb-2">
          Your Projects
        </h1>
        <p className="text-text-secondary mb-8">
          Brainstorm, decompose, refine, plan, execute, track.
        </p>

        {activeProject && (
          <ContinueBanner
            projectId={activeProject.id}
            projectName={activeProject.title}
            lastActiveNode={`${activeProject.taskStats.done}/${activeProject.taskStats.total} tasks done`}
            lastActive={activeProject.updatedAt.toLocaleDateString()}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          <NewProjectCard />
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              title={project.title}
              description={project.description}
              status={project.status}
              tasksDone={project.taskStats.done}
              totalTasks={project.taskStats.total}
              tasksInProgress={project.taskStats.inProgress}
              lastActive={project.updatedAt.toLocaleDateString()}
            />
          ))}
        </div>
      </PageShell>
    </>
  );
}
