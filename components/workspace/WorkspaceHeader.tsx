'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { ProjectSettingsModal } from '@/components/workspace/project-settings/ProjectSettingsModal';
import type { ProjectStatus } from '@/lib/types';

interface WorkspaceHeaderProps {
  /** @param projectId - UUID of the project. */
  projectId: string;
  /** @param projectName - Current project title for breadcrumb + modal. */
  projectName: string;
  /** @param description - Current project description for the settings modal. */
  description: string;
  /** @param identifier - Current project identifier (e.g. MYMR). */
  identifier: string;
  /** @param status - Current project lifecycle status (brainstorming → decomposing → active → archived). */
  status: ProjectStatus;
  /** @param categories - Current project categories. */
  categories: string[];
  /** @param taskCount - Total number of tasks (drives rename warning copy). */
  taskCount: number;
  /** @param canRename - True when the active org member is allowed to rename project identifiers. */
  canRename: boolean;
  /** @param stageLabel - Optional stage label shown in TopBar center. */
  stageLabel?: string;
  /** @param taskStats - Optional task stats shown in TopBar center. */
  taskStats?: string;
}

/**
 * Client-side header for the workspace — renders TopBar with a gear trigger
 * and owns {@link ProjectSettingsModal} open state. Refreshes the server-layout
 * data via router.refresh() after any successful update.
 * @param props - Header props seeded from the server layout.
 * @returns TopBar plus modal.
 */
export function WorkspaceHeader({
  projectId,
  projectName,
  description,
  identifier,
  status,
  categories,
  taskCount,
  canRename,
  stageLabel,
  taskStats,
}: WorkspaceHeaderProps) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

  /**
   * Refresh server layout data and notify the workspace page of the update.
   */
  const handleUpdated = (): void => {
    router.refresh();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mymir:project-updated', { detail: { projectId } }));
    }
  };

  return (
    <>
      <TopBar
        projectName={projectName}
        stageLabel={stageLabel}
        taskStats={taskStats}
        projectId={projectId}
        projectStatus={status}
        onOpenProjectSettings={() => setSettingsOpen(true)}
      />
      <ProjectSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        projectId={projectId}
        project={{ title: projectName, description, identifier, status, categories }}
        taskCount={taskCount}
        canRename={canRename}
        onUpdated={handleUpdated}
      />
    </>
  );
}

export default WorkspaceHeader;
