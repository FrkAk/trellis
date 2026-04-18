'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { updateProjectStatus } from '@/lib/actions/project';
import type { ProjectStatus } from '@/lib/types';

interface StatusSectionProps {
  projectId: string;
  status: ProjectStatus;
  onUpdated?: () => void;
}

/** Project lifecycle, ordered. */
const PROJECT_STATUS_FLOW: ProjectStatus[] = ['brainstorming', 'decomposing', 'active', 'archived'];

/** Display mapping for project statuses inside the modal stepper. */
const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; dot: string; text: string }> = {
  brainstorming: { label: 'Idea', dot: 'bg-accent', text: 'text-accent' },
  decomposing: { label: 'Building', dot: 'bg-progress', text: 'text-progress' },
  active: { label: 'Active', dot: 'bg-done', text: 'text-done' },
  archived: { label: 'Archived', dot: 'bg-draft', text: 'text-draft' },
};

const SECTION_LABEL_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted';

/**
 * Project lifecycle stepper — mirrors the task status stepper in DetailPanel.
 * Each step is clickable and calls `updateProjectStatus` server action.
 * @param props - Section props.
 * @returns Status row with stepper.
 */
export function StatusSection({ projectId, status, onUpdated }: StatusSectionProps) {
  const [pending, setPending] = useState<ProjectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<ProjectStatus>(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const currentIdx = PROJECT_STATUS_FLOW.indexOf(status);

  /**
   * Persist a new project status via the server action.
   * @param next - Target status.
   * @returns Resolves once the server round-trip completes and UI state settles.
   */
  const handleStatusChange = useCallback(async (next: ProjectStatus): Promise<void> => {
    if (next === statusRef.current) return;
    setPending(next);
    setError(null);
    try {
      const result = await updateProjectStatus(projectId, next);
      if (!result.ok) { setError(result.message); return; }
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setPending(null);
    }
  }, [projectId, onUpdated]);

  const isBusy = pending !== null;

  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Status</label>
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {PROJECT_STATUS_FLOW.map((s, i) => {
          const meta = PROJECT_STATUS_META[s];
          const isCurrent = s === status;
          const isPast = i < currentIdx;
          const isPending = pending === s;
          return (
            <div key={s} className="flex items-center">
              {i > 0 && (
                <div className={`mx-0.5 h-px w-3 ${isPast ? 'bg-done/40' : 'bg-border-strong'}`} />
              )}
              <motion.button
                whileHover={isBusy ? undefined : { scale: 1.02 }}
                whileTap={isBusy ? undefined : { scale: 0.98 }}
                type="button"
                onClick={() => handleStatusChange(s)}
                disabled={isBusy}
                className={`relative rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  isCurrent
                    ? `${meta.text} bg-surface-raised ring-1 ring-current/20`
                    : isPast
                      ? 'text-done/60 hover:bg-surface-hover'
                      : 'text-text-muted/60 hover:bg-surface-hover hover:text-text-muted'
                } ${isBusy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${isPending ? 'opacity-60' : ''}`}
                title={`Set status to ${meta.label}`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${isCurrent ? meta.dot : 'bg-current'}`} />
                  {meta.label}
                </span>
              </motion.button>
            </div>
          );
        })}
      </div>
      {error && (
        <p className="font-mono text-[10px] text-danger">{error}</p>
      )}
    </section>
  );
}
