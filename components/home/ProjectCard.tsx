'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { ProjectStatusModal, type CliManagedStatus } from '@/components/home/ProjectStatusModal';
import { deleteProjectAction } from '@/lib/actions/project';

interface ProjectCardProps {
  /** @param id - Project ID. */
  id: string;
  /** @param identifier - Human-readable project identifier (handle). */
  identifier: string;
  /** @param title - Project title. */
  title: string;
  /** @param description - Short project description. */
  description: string;
  /** @param status - Project lifecycle status. */
  status: string;
  /** @param tasksDone - Number of completed tasks. */
  tasksDone: number;
  /** @param totalTasks - Total number of tasks. */
  totalTasks: number;
  /** @param cancelledTasks - Number of cancelled tasks excluded from progress. */
  cancelledTasks?: number;
  /** @param tasksInProgress - Number of in-progress tasks. */
  tasksInProgress: number;
  /** @param lastActive - Relative time string. */
  lastActive: string;
  /** @param canDelete - True when the active org member is allowed to delete projects. */
  canDelete: boolean;
}

/**
 * Check whether a project status is handled by the CLI-only lifecycle modal.
 * @param status - Project lifecycle status.
 * @returns True when the status is `brainstorming` or `decomposing`.
 */
function isCliManagedStatus(status: string): status is CliManagedStatus {
  return status === 'brainstorming' || status === 'decomposing';
}

/**
 * Card displaying a project summary with progress, stats, and delete action.
 * Workspace-ready projects link into the workspace; CLI-managed projects open
 * a status modal so the user knows to continue from their coding agent.
 * @param props - Project data for rendering.
 * @returns A linked or button-wrapped project card element.
 */
export function ProjectCard({
  id,
  identifier,
  title,
  description,
  status,
  tasksDone,
  totalTasks,
  cancelledTasks = 0,
  tasksInProgress,
  lastActive,
  canDelete,
}: ProjectCardProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const opensWorkspace = status === 'active' || status === 'archived';
  const activeTasks = Math.max(totalTasks - cancelledTasks, 0);
  const progress = activeTasks > 0 ? Math.round((tasksDone / activeTasks) * 100) : 0;

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      setDeleteError(null);
      return;
    }
    const result = await deleteProjectAction(id);
    if (result.ok) {
      router.refresh();
      return;
    }
    setDeleteError(result.message);
    setConfirming(false);
  }, [confirming, id, router]);

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
    setDeleteError(null);
  }, []);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setModalOpen(true);
  }, []);

  const handleCardKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setModalOpen(true);
    }
  }, []);

  const body = (
    <motion.div
      whileHover={{ y: -2 }}
      className="group relative flex flex-col rounded-xl border border-border bg-surface p-5 text-left shadow-[var(--shadow-card)] transition-all hover:border-border-strong hover:shadow-[var(--shadow-card-hover)]"
    >
      {canDelete && (
        <div className="absolute right-3 top-3">
          {confirming ? (
            <div
              className="flex items-center gap-1.5"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <button
                onClick={handleDelete}
                className="cursor-pointer rounded-md px-2 py-1 text-[10px] font-semibold text-danger transition-colors hover:bg-danger/10"
              >
                Delete
              </button>
              <button
                onClick={handleCancelDelete}
                className="cursor-pointer rounded-md px-2 py-1 text-[10px] text-text-muted transition-colors hover:bg-surface-hover"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="cursor-pointer rounded-md p-1.5 text-text-muted opacity-0 transition-all hover:bg-surface-hover hover:text-danger group-hover:opacity-100"
              title="Delete project"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5a.75.75 0 01.786-.711z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      )}
      <h3 className="mb-1 text-sm font-semibold text-text-primary pr-8">{title}</h3>
      <p className="mb-4 text-xs leading-relaxed text-text-muted line-clamp-2 flex-1">
        {description}
      </p>

      {deleteError && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-danger/20 bg-danger/10 px-2 py-1 font-mono text-[10px] text-danger"
        >
          {deleteError}
        </div>
      )}

      <ProgressBar value={progress} status={progress === 100 ? 'done' : 'in-progress'} className="mb-3" />

      <div className="flex flex-col gap-2">
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
          status === 'active' ? 'bg-done/15 text-done'
          : status === 'decomposing' ? 'bg-progress/15 text-progress'
          : status === 'brainstorming' ? 'bg-accent/15 text-accent'
          : 'bg-draft/10 text-draft'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            status === 'active' ? 'bg-done'
            : status === 'decomposing' ? 'bg-progress'
            : status === 'brainstorming' ? 'bg-accent'
            : 'bg-draft'
          }`} />
          {status === 'brainstorming' ? 'Idea' : status === 'decomposing' ? 'Building' : status === 'active' ? 'Active' : status}
        </span>
        <div className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-text-muted">
          <span className="text-text-secondary">{identifier}</span>
          <span className="text-text-muted/40">·</span>
          <span>{tasksDone}/{activeTasks} tasks</span>
          {cancelledTasks > 0 && (
            <>
              <span className="text-text-muted/40">·</span>
              <span>{cancelledTasks} cancelled</span>
            </>
          )}
          {tasksInProgress > 0 && (
            <>
              <span className="text-text-muted/40">·</span>
              <span>{tasksInProgress} active</span>
            </>
          )}
          <span className="text-text-muted/40">·</span>
          <span>{lastActive}</span>
        </div>
      </div>
    </motion.div>
  );

  if (opensWorkspace || !isCliManagedStatus(status)) {
    return (
      <Link href={`/project/${id}`} className="block no-underline">
        {body}
      </Link>
    );
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        className="block cursor-pointer no-underline"
      >
        {body}
      </div>
      <ProjectStatusModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        status={status}
        title={title}
        identifier={identifier}
      />
    </>
  );
}

export default ProjectCard;
