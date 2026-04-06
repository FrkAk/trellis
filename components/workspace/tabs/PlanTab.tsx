'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/shared/Button';
import { CopyButton } from '@/components/shared/CopyButton';
import { updateTask } from '@/lib/graph/mutations';
import { useUndo, UndoButton } from '@/hooks/useUndo';
import type { TaskEdge } from '@/lib/db/schema';

interface PlanTabProps {
  /** @param taskId - UUID of the task. */
  taskId: string;
  /** @param projectId - UUID of the project. */
  projectId: string;
  /** @param status - Current task status. */
  status: string;
  /** @param planningContext - Pre-built planning context for external agents. */
  planningContext: string;
  /** @param existingPlan - Saved implementation plan text, if any. */
  existingPlan: string | null;
  /** @param existingExecution - Saved execution record text, if any. */
  existingExecution: string | null;
  /** @param edges - Edges connected to this task. */
  edges?: TaskEdge[];
  /** @param taskMap - Map of task IDs to titles. */
  taskMap?: Map<string, { title: string; status: string }>;
  /** @param onGraphChange - Called after status transitions to refresh UI. */
  onGraphChange?: () => void;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Plan tab handling the full task lifecycle bridge:
 * Draft → paste plan → Planned → start impl → In Progress → record execution → Done.
 * @param props - Plan tab configuration.
 * @returns Plan tab with context export, plan upload, and execution tracking.
 */
export function PlanTab({
  taskId,
  status,
  planningContext,
  existingPlan,
  existingExecution,
  edges = [],
  taskMap,
  onGraphChange,
  className = '',
}: PlanTabProps) {
  const [plan, setPlan] = useState(existingPlan);
  const started = status === 'in_progress' || status === 'done';
  const [execution, setExecution] = useState(existingExecution);
  const [planInput, setPlanInput] = useState('');
  const [executionInput, setExecutionInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleUndoAction = useCallback(async (action: 'plan-saved' | 'start-impl' | 'mark-done') => {
    setSaving(true);
    if (action === 'plan-saved') {
      await updateTask(taskId, { implementationPlan: null, status: 'draft' });
      setPlan(null);
      setPlanInput('');
    } else if (action === 'start-impl') {
      await updateTask(taskId, { status: 'planned' });
    } else {
      await updateTask(taskId, { executionRecord: null, status: 'in_progress' });
      setExecution(null);
    }
    setSaving(false);
    onGraphChange?.();
  }, [taskId, onGraphChange]);

  const { canUndo: canUndoPlan, push: pushPlanUndo, undo: undoPlan } = useUndo<'plan-saved' | 'start-impl' | 'mark-done'>({ onUndo: handleUndoAction });

  const unmetDeps = useMemo(() => {
    if (!taskMap) return [];
    return edges
      .filter((e) => e.sourceTaskId === taskId && e.edgeType === 'depends_on')
      .map((e) => {
        const info = taskMap.get(e.targetTaskId);
        return info && info.status !== 'done' ? { id: e.targetTaskId, title: info.title } : null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [edges, taskId, taskMap]);

  const handleSavePlan = useCallback(async () => {
    if (!planInput.trim()) return;
    setSaving(true);
    await updateTask(taskId, {
      implementationPlan: planInput.trim(),
      status: 'planned',
    });
    setPlan(planInput.trim());
    setSaving(false);
    pushPlanUndo('plan-saved');
    onGraphChange?.();
  }, [taskId, planInput, pushPlanUndo, onGraphChange]);

  const handleStartImpl = useCallback(async () => {
    setSaving(true);
    await updateTask(taskId, { status: 'in_progress' });
    setSaving(false);
    pushPlanUndo('start-impl');
    onGraphChange?.();
  }, [taskId, pushPlanUndo, onGraphChange]);

  const handleMarkDone = useCallback(async () => {
    setSaving(true);
    const record = executionInput.trim() || 'Completed';
    await updateTask(taskId, {
      executionRecord: record,
      status: 'done',
    });
    setExecution(record);
    setSaving(false);
    pushPlanUndo('mark-done');
    onGraphChange?.();
  }, [taskId, executionInput, pushPlanUndo, onGraphChange]);

  const handleReplan = useCallback(() => {
    setPlan(null);
    setPlanInput('');
  }, []);

  // Phase A: No plan yet -- show context + upload
  if (!plan) {
    return (
      <div className={`overflow-y-auto p-5 space-y-5 ${className}`}>
        <div>
          <h4 className="mb-1 text-sm font-semibold text-text-primary">Plan This Task</h4>
          <p className="text-xs text-text-secondary">
            Copy the context below into your coding agent&apos;s plan mode (Claude Code, Cursor, Codex, etc.), then paste back the implementation plan.
          </p>
        </div>

        {unmetDeps.length > 0 && (
          <div className="rounded-lg border border-progress/20 bg-progress/5 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-progress">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996a.75.75 0 1 0-1.5 0v3a.75.75 0 0 0 1.5 0ZM8 10.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" clipRule="evenodd" />
              </svg>
              Unmet dependencies
            </div>
            <p className="mt-1.5 text-xs text-text-secondary">
              This task depends on items that aren&apos;t done yet. Planning may be premature.
            </p>
            <ul className="mt-2 space-y-1">
              {unmetDeps.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className="h-1 w-1 rounded-full bg-progress/60" />
                  <span className="font-medium text-text-primary">{d.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Step 1: Planning context */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              1. Copy planning context
            </h4>
            <CopyButton text={planningContext} label="Copy" />
          </div>
          <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-surface-raised p-3 font-mono text-xs text-text-secondary leading-relaxed">
            {planningContext}
          </pre>
        </section>

        {/* Step 2: Paste plan */}
        <section>
          <h4 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            2. Paste the implementation plan
          </h4>
          <textarea
            value={planInput}
            onChange={(e) => setPlanInput(e.target.value)}
            placeholder="Paste your coding agent's implementation plan here..."
            className="w-full resize-none rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
            rows={10}
          />
          <Button
            variant="primary"
            size="sm"
            className="mt-2"
            disabled={!planInput.trim() || saving}
            onClick={handleSavePlan}
          >
            {saving ? 'Saving...' : 'Save Plan & Mark as Planned'}
          </Button>
        </section>
      </div>
    );
  }

  // Phase B: Plan saved -- show plan + execution tracking
  return (
    <div className={`overflow-y-auto p-5 space-y-5 ${className}`}>
      {/* Saved plan display */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-text-primary">Implementation Plan</h4>
          <div className="flex items-center gap-2">
            <UndoButton canUndo={canUndoPlan && !execution} onUndo={undoPlan} />
            {!execution && (
              <button
                onClick={handleReplan}
                className="cursor-pointer text-xs text-text-muted underline transition-colors hover:text-text-secondary"
              >
                Re-plan
              </button>
            )}
          </div>
        </div>
        <pre className="max-h-60 overflow-auto rounded-lg border border-border bg-surface-raised p-3 font-mono text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
          {plan}
        </pre>
      </section>

      {/* Lifecycle phases */}
      {execution ? (
        /* Phase D: Done — show execution record */
        <section className="rounded-lg border border-done/20 bg-done/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-done">
              <span className="inline-block h-2 w-2 rounded-full bg-done" />
              Completed
            </h4>
            <UndoButton canUndo={canUndoPlan} onUndo={undoPlan} />
          </div>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface-raised p-2 font-mono text-xs text-text-secondary whitespace-pre-wrap">
            {execution}
          </pre>
        </section>
      ) : !started ? (
        /* Phase B: Planned — start implementation */
        <section className="rounded-lg border border-planned/20 bg-planned/5 p-4 space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-planned">
            <span className="inline-block h-2 w-2 rounded-full bg-planned" />
            Ready to Implement
          </h4>
          <p className="text-xs text-text-secondary">
            Plan is saved. Start implementation to claim this task and begin tracking execution.
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled={saving}
            onClick={handleStartImpl}
          >
            {saving ? 'Starting...' : 'Start Implementation'}
          </Button>
        </section>
      ) : (
        /* Phase C: In Progress — record execution */
        <section className="rounded-lg border border-progress/20 bg-progress/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-progress">
              <span className="inline-block h-2 w-2 rounded-full bg-progress status-pulse" />
              In Progress
            </h4>
            <UndoButton canUndo={canUndoPlan} onUndo={undoPlan} />
          </div>
          <p className="text-xs text-text-secondary">
            Record the results after implementing this task.
          </p>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
              Execution Output
            </label>
            <textarea
              value={executionInput}
              onChange={(e) => setExecutionInput(e.target.value)}
              placeholder="Paste the final output from your coding agent, PR link, notes..."
              className="w-full resize-none rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
              rows={6}
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            disabled={saving}
            onClick={handleMarkDone}
          >
            {saving ? 'Saving...' : 'Mark as Done'}
          </Button>
        </section>
      )}
    </div>
  );
}

export default PlanTab;
