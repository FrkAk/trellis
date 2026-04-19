'use client';

import { useEffect, useReducer, useRef } from 'react';
import { motion } from 'motion/react';
import { parseIdentifier } from '@/lib/graph/identifier';
import { updateProjectSettings } from '@/lib/actions/project';

interface IdentifierSectionProps {
  projectId: string;
  identifier: string;
  taskCount: number;
  onUpdated?: () => void;
}

/** Internal state for the identifier edit flow. */
type IdentifierState =
  | { kind: 'closed'; initial: string }
  | { kind: 'editing'; draft: string; initial: string; validationError?: string }
  | { kind: 'confirming'; draft: string; initial: string }
  | { kind: 'saving'; draft: string; initial: string }
  | { kind: 'error'; draft: string; initial: string; serverError: string };

/** Transitions applied by {@link identifierReducer}. */
type IdentifierAction =
  | { type: 'sync_initial'; initial: string }
  | { type: 'start_edit' }
  | { type: 'edit'; draft: string; validationError?: string }
  | { type: 'request_confirm' }
  | { type: 'cancel_confirm' }
  | { type: 'submit' }
  | { type: 'submit_failure'; serverError: string }
  | { type: 'cancel' };

const SECTION_LABEL_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted';

/**
 * Reduce a single action on the identifier edit state machine.
 * @param state - Prior state.
 * @param action - Dispatched transition.
 * @returns Next state; unchanged if the transition is not valid for `state`.
 */
function identifierReducer(state: IdentifierState, action: IdentifierAction): IdentifierState {
  switch (action.type) {
    case 'sync_initial': {
      if (state.kind === 'closed') return { kind: 'closed', initial: action.initial };
      return state;
    }
    case 'start_edit':
      return { kind: 'editing', draft: state.initial, initial: state.initial };
    case 'edit':
      if (state.kind !== 'editing') return state;
      return { kind: 'editing', draft: action.draft, initial: state.initial, validationError: action.validationError };
    case 'request_confirm':
      if (state.kind !== 'editing' || state.validationError) return state;
      return { kind: 'confirming', draft: state.draft, initial: state.initial };
    case 'cancel_confirm':
      if (state.kind !== 'confirming' && state.kind !== 'error') return state;
      return { kind: 'editing', draft: state.draft, initial: state.initial };
    case 'submit':
      if (state.kind !== 'confirming') return state;
      return { kind: 'saving', draft: state.draft, initial: state.initial };
    case 'submit_failure':
      if (state.kind !== 'saving') return state;
      return { kind: 'error', draft: state.draft, initial: state.initial, serverError: action.serverError };
    case 'cancel':
      return { kind: 'closed', initial: state.initial };
  }
}

/**
 * Identifier edit + 2-click rename confirm.
 *
 * Validation runs live via {@link parseIdentifier}. On submit, replaces the
 * Save/Cancel row with an inline danger banner explaining the external-ref
 * breakage; the actual rename only fires on the second confirm click.
 *
 * @param props - Section props.
 * @returns Identifier row with rename flow.
 */
export function IdentifierSection({ projectId, identifier, taskCount, onUpdated }: IdentifierSectionProps) {
  const [state, dispatch] = useReducer(identifierReducer, { kind: 'closed', initial: identifier });
  const submittingRef = useRef(false);

  useEffect(() => {
    dispatch({ type: 'sync_initial', initial: identifier });
  }, [identifier]);

  /**
   * Normalize raw input to the identifier shape and dispatch the live edit.
   * @param raw - Raw input from the text field.
   */
  const handleDraftChange = (raw: string): void => {
    const next = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const parsed = parseIdentifier(next);
    const validationError = parsed.ok ? undefined : parsed.error;
    dispatch({ type: 'edit', draft: next, validationError });
  };

  /**
   * Persist the identifier rename via the server action.
   * @param draft - Target identifier (already validated).
   * @returns Resolves once the server round-trip completes.
   */
  const commitRename = async (draft: string): Promise<void> => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    dispatch({ type: 'submit' });
    try {
      const result = await updateProjectSettings(projectId, { identifier: draft });
      if (result.ok) {
        dispatch({ type: 'cancel' });
        onUpdated?.();
        return;
      }
      dispatch({ type: 'submit_failure', serverError: result.message });
    } finally {
      submittingRef.current = false;
    }
  };

  if (state.kind === 'closed') {
    return (
      <section className="space-y-1.5">
        <label className={SECTION_LABEL_CLASS}>Identifier</label>
        <button
          type="button"
          onClick={() => dispatch({ type: 'start_edit' })}
          className="w-full cursor-pointer rounded-lg border border-transparent px-3 py-2 text-left font-mono text-xs text-text-primary transition-colors hover:border-border hover:bg-surface-hover/40"
        >
          {identifier}
          <span className="ml-2 font-sans text-[11px] text-text-muted">click to rename</span>
        </button>
      </section>
    );
  }

  const draft = state.draft;
  const validationError = state.kind === 'editing' ? state.validationError : undefined;
  const canSave = !validationError && draft !== state.initial && draft.length >= 2;
  const isSaving = state.kind === 'saving';
  const showConfirmPanel = state.kind === 'confirming' || state.kind === 'saving' || state.kind === 'error';
  const serverError = state.kind === 'error' ? state.serverError : null;

  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Identifier</label>
      <div className="space-y-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') dispatch({ type: 'cancel' });
          }}
          autoFocus
          disabled={showConfirmPanel}
          className="w-full rounded-lg border border-border-strong bg-base px-3 py-2 font-mono text-sm uppercase tracking-wider text-text-primary outline-none transition-colors focus:border-accent disabled:opacity-60"
        />
        {validationError && (
          <p className="font-mono text-[10px] text-danger">{validationError}</p>
        )}
        {!validationError && (
          <p className="font-mono text-[10px] text-text-muted">
            Preview: <span className="text-text-secondary">{draft || state.initial}-1</span>
          </p>
        )}

        {!showConfirmPanel ? (
          <div className="flex gap-2">
            <motion.button
              whileHover={!canSave ? undefined : { scale: 1.02 }}
              whileTap={!canSave ? undefined : { scale: 0.98 }}
              type="button"
              onClick={() => dispatch({ type: 'request_confirm' })}
              disabled={!canSave}
              className="cursor-pointer rounded-md border border-border-strong bg-transparent px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-primary shadow-[var(--shadow-button)] transition-opacity hover:opacity-60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => dispatch({ type: 'cancel' })}
              className="cursor-pointer rounded-md bg-transparent px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
            >
              Cancel
            </motion.button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-danger/20 bg-danger/10 p-3 text-xs">
            <p className="font-semibold text-danger">
              Rename {state.initial} → {draft}?
            </p>
            <p className="text-text-secondary">
              All {taskCount} task IDs will change to{' '}
              <code className="font-mono text-text-primary">{draft}-N</code>. External references
              (GitHub PRs, docs, commit messages, links) to the old prefix will no longer resolve.
            </p>
            <div className="flex gap-2 pt-0.5">
              <motion.button
                whileHover={isSaving ? undefined : { scale: 1.02 }}
                whileTap={isSaving ? undefined : { scale: 0.98 }}
                type="button"
                onClick={() => commitRename(draft)}
                disabled={isSaving}
                className="cursor-pointer rounded-md border border-border-strong bg-transparent px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-danger shadow-[var(--shadow-button)] transition-opacity hover:opacity-60 disabled:opacity-50"
              >
                {isSaving ? 'Renaming…' : 'Rename'}
              </motion.button>
              <motion.button
                whileHover={isSaving ? undefined : { scale: 1.02 }}
                whileTap={isSaving ? undefined : { scale: 0.98 }}
                type="button"
                onClick={() => dispatch({ type: 'cancel_confirm' })}
                disabled={isSaving}
                className="cursor-pointer rounded-md bg-transparent px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
              >
                Cancel
              </motion.button>
            </div>
          </div>
        )}

        {serverError && (
          <p className="font-mono text-[10px] text-danger">{serverError}</p>
        )}
      </div>
    </section>
  );
}
