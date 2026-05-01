'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { updateProjectStatus, type WebAllowedStatus } from '@/lib/actions/project';
import type { ProjectStatus } from '@/lib/types';

interface StatusSectionProps {
  /** @param projectId - UUID of the project. */
  projectId: string;
  /** @param status - Current project status. */
  status: ProjectStatus;
  /** @param onUpdated - Fired after a successful status change. */
  onUpdated?: () => void;
}

const STATUS_OPTIONS: { id: WebAllowedStatus; label: string; dot: string; text: string }[] = [
  { id: 'active', label: 'Active', dot: 'bg-done', text: 'text-done' },
  { id: 'archived', label: 'Archived', dot: 'bg-draft', text: 'text-draft' },
];

const SECTION_LABEL_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted';

/**
 * Active ↔ archived toggle. Hidden when the project is in a CLI-only phase
 * (brainstorming/decomposing) — those transitions belong to the coding agent.
 * Archiving from inside the workspace redirects home; unarchive flips back.
 * @param props - Section props.
 * @returns Status row with two-pill toggle, or null when status is CLI-managed.
 */
export function StatusSection({ projectId, status, onUpdated }: StatusSectionProps) {
  const router = useRouter();
  const [pending, setPending] = useState<WebAllowedStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<ProjectStatus>(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const handleStatusChange = useCallback(async (next: WebAllowedStatus): Promise<void> => {
    if (next === statusRef.current) return;
    setPending(next);
    setError(null);
    try {
      const result = await updateProjectStatus(projectId, next);
      if (!result.ok) { setError(result.message); return; }
      onUpdated?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setPending(null);
    }
  }, [projectId, onUpdated, router]);

  if (status !== 'active' && status !== 'archived') return null;

  const isBusy = pending !== null;

  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Status</label>
      <div className="flex items-center gap-1">
        {STATUS_OPTIONS.map((opt) => {
          const isCurrent = opt.id === status;
          const isPending = pending === opt.id;
          return (
            <motion.button
              key={opt.id}
              whileHover={isBusy || isCurrent ? undefined : { scale: 1.02 }}
              whileTap={isBusy || isCurrent ? undefined : { scale: 0.98 }}
              type="button"
              onClick={() => handleStatusChange(opt.id)}
              disabled={isBusy || isCurrent}
              className={`relative rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all ${
                isCurrent
                  ? `${opt.text} bg-surface-raised ring-1 ring-current/20`
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
              } ${isBusy ? 'cursor-not-allowed opacity-50' : isCurrent ? 'cursor-default' : 'cursor-pointer'} ${isPending ? 'opacity-60' : ''}`}
              title={`Set status to ${opt.label}`}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${isCurrent ? opt.dot : 'bg-current'}`} />
                {opt.label}
              </span>
            </motion.button>
          );
        })}
      </div>
      {error && (
        <p className="font-mono text-[10px] text-danger">{error}</p>
      )}
    </section>
  );
}
