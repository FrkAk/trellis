'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import Markdown from 'react-markdown';
import { Badge } from '@/components/shared/Badge';
import { Checkbox } from '@/components/shared/Checkbox';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { updateTask, createEdge, removeEdge } from '@/lib/graph/mutations';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { getSettings } from '@/lib/settings';
import { getMessageText, convertPersistedToUIMessages } from '@/lib/chat-helpers';
import { useUndo, UndoButton } from '@/hooks/useUndo';
import type { TaskEdge } from '@/lib/db/schema';
import type { AcceptanceCriterion, Decision } from '@/lib/types';

interface TaskTabProps {
  /** @param taskId - UUID of the selected task. */
  taskId: string;
  /** @param projectId - UUID of the project. */
  projectId: string;
  /** @param description - Task description. */
  description: string;
  /** @param acceptanceCriteria - Task acceptance criteria. */
  acceptanceCriteria?: AcceptanceCriterion[];
  /** @param decisions - Task decisions. */
  decisions: Decision[];
  /** @param edges - Edges connected to this task. */
  edges: TaskEdge[];
  /** @param taskMap - Map of task IDs to titles. */
  taskMap: Map<string, { title: string; status: string }>;
  /** @param onSelectNode - Called when a relationship link is clicked. */
  onSelectNode: (taskId: string) => void;
  /** @param files - File paths this task touches. */
  files?: string[];
  /** @param executionRecord - Summary of what was built during implementation. */
  executionRecord?: string | null;
  /** @param onGraphChange - Called after graph mutations to trigger re-fetch. */
  onGraphChange?: () => void;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Task tab with collapsible spec sections and AI refinement chat.
 * @param props - Task tab configuration.
 * @returns Vertical split with spec (collapsible top) and chat (flex bottom).
 */
export function TaskTab({
  taskId,
  projectId,
  description,
  acceptanceCriteria,
  decisions,
  edges,
  taskMap,
  onSelectNode,
  files,
  executionRecord,
  onGraphChange,
  className = '',
}: TaskTabProps) {
  const [desc, setDesc] = useState(description);
  const [editingDesc, setEditingDesc] = useState(false);
  const [localCriteria, setLocalCriteria] = useState(acceptanceCriteria ?? []);
  const localCriteriaRef = useRef(localCriteria);
  localCriteriaRef.current = localCriteria;
  const lastCriteriaMutationRef = useRef(0);
  const [editingCriterionId, setEditingCriterionId] = useState<string | null>(null);
  const [addingCriterion, setAddingCriterion] = useState(false);
  const [localDecisions, setLocalDecisions] = useState(decisions);
  const localDecisionsRef = useRef(localDecisions);
  localDecisionsRef.current = localDecisions;
  const lastDecisionMutationRef = useRef(0);
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
  const [addingDecision, setAddingDecision] = useState(false);
  const cancelledRef = useRef(false);
  const [specCollapsed, setSpecCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(true);

  const toggleSpec = () => {
    if (!specCollapsed && chatCollapsed) setChatCollapsed(false);
    setSpecCollapsed(!specCollapsed);
  };

  const toggleChat = () => {
    if (!chatCollapsed && specCollapsed) setSpecCollapsed(false);
    setChatCollapsed(!chatCollapsed);
  };
  const [loadedHistory, setLoadedHistory] = useState<UIMessage[] | null>(null);

  // Sync local state when props change (after graph re-fetch).
  // Suppressed briefly after local mutations to prevent stale SSE refreshes from clobbering optimistic state.
  useEffect(() => {
    if (Date.now() - lastCriteriaMutationRef.current < 1000) return;
    const raw = acceptanceCriteria ?? [];
    const seen = new Set<string>();
    const incoming = raw.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    const currentIds = localCriteriaRef.current.map((c) => c.id + c.checked + c.text).join('|');
    const incomingIds = incoming.map((c) => c.id + c.checked + c.text).join('|');
    if (currentIds !== incomingIds) setLocalCriteria(incoming);
  }, [acceptanceCriteria]);
  useEffect(() => { setDesc(description); }, [description]);

  // Sync decisions from props (same suppression pattern as criteria)
  useEffect(() => {
    if (Date.now() - lastDecisionMutationRef.current < 1000) return;
    const currentIds = localDecisionsRef.current.map((d) => d.id + d.text).join('|');
    const incomingIds = decisions.map((d) => d.id + d.text).join('|');
    if (currentIds !== incomingIds) setLocalDecisions(decisions);
  }, [decisions]);

  // Reset editing state when switching nodes
  useEffect(() => {
    setEditingCriterionId(null);
    setAddingCriterion(false);
    setEditingDecisionId(null);
    setAddingDecision(false);
  }, [taskId]);

  const [historyError, setHistoryError] = useState(false);

  // Load persisted chat history on mount / node change
  useEffect(() => {
    setLoadedHistory(null);
    setHistoryError(false);
    fetch(`/api/project/${projectId}/conversations?taskId=${taskId}`)
      .then((r) => r.json())
      .then((data) => setLoadedHistory(convertPersistedToUIMessages(data.messages ?? [])))
      .catch((err) => { console.error('[refine] history fetch failed:', err); setHistoryError(true); setLoadedHistory([]); });
  }, [projectId, taskId]);

  const retryHistory = useCallback(() => {
    setHistoryError(false);
    setLoadedHistory(null);
    fetch(`/api/project/${projectId}/conversations?taskId=${taskId}`)
      .then((r) => r.json())
      .then((data) => setLoadedHistory(convertPersistedToUIMessages(data.messages ?? [])))
      .catch((err) => { console.error('[refine] history fetch failed:', err); setHistoryError(true); setLoadedHistory([]); });
  }, [projectId, taskId]);

  const handleSaveDesc = useCallback(async () => {
    setEditingDesc(false);
    if (desc !== description) {
      await updateTask(taskId, { description: desc });
      onGraphChange?.();
    }
  }, [desc, description, taskId, onGraphChange]);

  const handleToggleCriterion = useCallback(
    async (criterionId: string) => {
      const updated = localCriteriaRef.current.map((c) =>
        c.id === criterionId ? { ...c, checked: !c.checked } : c,
      );
      setLocalCriteria(updated);
      lastCriteriaMutationRef.current = Date.now();
      await updateTask(taskId, { acceptanceCriteria: updated }, true);
    },
    [taskId],
  );

  const handleSaveCriterionText = useCallback(
    async (criterionId: string, newText: string) => {
      const trimmed = newText.trim();
      if (!trimmed) { setEditingCriterionId(null); return; }
      const criterion = localCriteria.find((c) => c.id === criterionId);
      if (criterion && trimmed === criterion.text) { setEditingCriterionId(null); return; }
      const updated = localCriteria.map((c) =>
        c.id === criterionId ? { ...c, text: trimmed } : c,
      );
      setLocalCriteria(updated);
      setEditingCriterionId(null);
      lastCriteriaMutationRef.current = Date.now();
      await updateTask(taskId, { acceptanceCriteria: updated }, true);
    },
    [localCriteria, taskId],
  );

  const handleRestoreCriterion = useCallback(
    async (item: { criterion: AcceptanceCriterion; index: number }) => {
      const restored = [...localCriteriaRef.current];
      restored.splice(item.index, 0, item.criterion);
      setLocalCriteria(restored);
      lastCriteriaMutationRef.current = Date.now();
      await updateTask(taskId, { acceptanceCriteria: restored }, true);
    },
    [taskId],
  );

  const { canUndo: canUndoCriteria, push: pushCriteriaUndo, undo: undoCriteria } = useUndo<{ criterion: AcceptanceCriterion; index: number }>({
    onUndo: handleRestoreCriterion,
    resetOn: taskId,
    keyboard: true,
  });

  const handleDeleteCriterion = useCallback(
    async (criterionId: string) => {
      const index = localCriteria.findIndex((c) => c.id === criterionId);
      if (index === -1) return;
      const deleted = localCriteria[index];
      const updated = localCriteria.filter((c) => c.id !== criterionId);
      setLocalCriteria(updated);
      setEditingCriterionId(null);
      pushCriteriaUndo({ criterion: deleted, index });
      lastCriteriaMutationRef.current = Date.now();
      await updateTask(taskId, { acceptanceCriteria: updated }, true);
    },
    [localCriteria, taskId, pushCriteriaUndo],
  );

  const handleAddCriterion = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) { setAddingCriterion(false); return; }
      const newCriterion: AcceptanceCriterion = {
        id: crypto.randomUUID(),
        text: trimmed,
        checked: false,
      };
      const updated = [...localCriteria, newCriterion];
      setLocalCriteria(updated);
      setAddingCriterion(false);
      lastCriteriaMutationRef.current = Date.now();
      await updateTask(taskId, { acceptanceCriteria: updated }, true);
      onGraphChange?.();
    },
    [localCriteria, taskId, onGraphChange],
  );

  // --- Decision handlers (mirrors criteria pattern) ---

  const handleSaveDecisionText = useCallback(
    async (decisionId: string, newText: string) => {
      const trimmed = newText.trim();
      if (!trimmed) { setEditingDecisionId(null); return; }
      const decision = localDecisions.find((d) => d.id === decisionId);
      if (decision && trimmed === decision.text) { setEditingDecisionId(null); return; }
      const updated = localDecisions.map((d) =>
        d.id === decisionId ? { ...d, text: trimmed } : d,
      );
      setLocalDecisions(updated);
      setEditingDecisionId(null);
      lastDecisionMutationRef.current = Date.now();
      await updateTask(taskId, { decisions: updated }, true);
    },
    [localDecisions, taskId],
  );

  const handleRestoreDecision = useCallback(
    async (item: { decision: Decision; index: number }) => {
      const restored = [...localDecisionsRef.current];
      restored.splice(item.index, 0, item.decision);
      setLocalDecisions(restored);
      lastDecisionMutationRef.current = Date.now();
      await updateTask(taskId, { decisions: restored }, true);
    },
    [taskId],
  );

  const { canUndo: canUndoDecision, push: pushDecisionUndo, undo: undoDecision } = useUndo<{ decision: Decision; index: number }>({
    onUndo: handleRestoreDecision,
    resetOn: taskId,
  });

  const handleDeleteDecision = useCallback(
    async (decisionId: string) => {
      const index = localDecisions.findIndex((d) => d.id === decisionId);
      if (index === -1) return;
      const deleted = localDecisions[index];
      const updated = localDecisions.filter((d) => d.id !== decisionId);
      setLocalDecisions(updated);
      setEditingDecisionId(null);
      pushDecisionUndo({ decision: deleted, index });
      lastDecisionMutationRef.current = Date.now();
      await updateTask(taskId, { decisions: updated }, true);
    },
    [localDecisions, taskId, pushDecisionUndo],
  );

  const handleAddDecision = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) { setAddingDecision(false); return; }
      const newDecision: Decision = {
        id: crypto.randomUUID(),
        text: trimmed,
        date: new Date().toISOString().slice(0, 10),
        source: 'refinement',
      };
      const updated = [...localDecisions, newDecision];
      setLocalDecisions(updated);
      setAddingDecision(false);
      lastDecisionMutationRef.current = Date.now();
      await updateTask(taskId, { decisions: updated }, true);
      onGraphChange?.();
    },
    [localDecisions, taskId, onGraphChange],
  );

  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* Spec section (collapsible — expands fully when chat is hidden) */}
      <div className={`overflow-y-auto transition-all duration-200 ${specCollapsed ? 'h-0 overflow-hidden' : chatCollapsed ? 'flex-1' : 'max-h-[240px] shrink-0'}`}>
        <div className="min-w-0 space-y-3 p-5">
          {/* Description */}
          <section>
            <h4 className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Description
            </h4>
            {editingDesc ? (
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={() => {
                  if (cancelledRef.current) { cancelledRef.current = false; setDesc(description); setEditingDesc(false); }
                  else handleSaveDesc();
                }}
                onKeyDown={(e) => { if (e.key === 'Escape') { cancelledRef.current = true; e.currentTarget.blur(); } }}
                autoFocus
                className="w-full resize-none rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-colors duration-150 focus:border-accent"
                rows={3}
              />
            ) : (
              <div
                onClick={() => setEditingDesc(true)}
                className="group/edit relative cursor-pointer rounded-lg border border-transparent px-3 py-2 text-sm text-text-secondary transition-all duration-150 hover:border-border hover:bg-surface"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="absolute right-2 top-2 h-3 w-3 text-text-muted opacity-0 transition-opacity duration-150 group-hover/edit:opacity-100">
                  <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.463 11.1a.25.25 0 00-.064.108l-.563 1.97 1.971-.564a.25.25 0 00.108-.064l8.609-8.61a.25.25 0 000-.353l-1.097-1.097z" />
                </svg>
                {desc ? (
                  <div className="prose-spec"><Markdown>{desc}</Markdown></div>
                ) : (
                  <p className="italic text-text-muted">Click to add description...</p>
                )}
              </div>
            )}
          </section>

          {/* Acceptance Criteria */}
          {acceptanceCriteria !== undefined && (
            <section>
              <div className="mb-1 flex items-center">
                <h4 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Acceptance Criteria
                </h4>
                <UndoButton canUndo={canUndoCriteria} onUndo={undoCriteria} className="ml-auto" />
              </div>
              <div>
                {localCriteria.map((c) => (
                  <div key={c.id} className="group/criterion flex items-center gap-2">
                    <Checkbox
                      checked={c.checked}
                      onChange={() => handleToggleCriterion(c.id)}
                      className="!min-h-0 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      {editingCriterionId === c.id ? (
                        <textarea
                          defaultValue={c.text}
                          onBlur={(e) => {
                            if (cancelledRef.current) { cancelledRef.current = false; setEditingCriterionId(null); }
                            else handleSaveCriterionText(c.id, e.target.value);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Escape') { cancelledRef.current = true; e.currentTarget.blur(); } }}
                          autoFocus
                          rows={1}
                          className="w-full resize-none rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm text-text-primary outline-none transition-colors duration-150 focus:border-accent"
                        />
                      ) : (
                        <div
                          onClick={() => setEditingCriterionId(c.id)}
                          className={`group/cedit relative cursor-pointer rounded-lg border border-transparent px-3 py-1 text-sm transition-all duration-150 hover:border-border hover:bg-surface ${
                            c.checked ? 'text-text-muted line-through' : 'text-text-secondary'
                          }`}
                        >
                          <svg viewBox="0 0 16 16" fill="currentColor" className="absolute right-2 top-1.5 h-3 w-3 text-text-muted opacity-0 transition-opacity duration-150 group-hover/cedit:opacity-100">
                            <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.463 11.1a.25.25 0 00-.064.108l-.563 1.97 1.971-.564a.25.25 0 00.108-.064l8.609-8.61a.25.25 0 000-.353l-1.097-1.097z" />
                          </svg>
                          <div className="prose-spec"><Markdown>{c.text}</Markdown></div>
                        </div>
                      )}
                    </div>
                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteCriterion(c.id)}
                      className="shrink-0 cursor-pointer rounded p-1 text-text-muted opacity-0 transition-all duration-150 hover:text-danger group-hover/criterion:opacity-100"
                      aria-label="Delete criterion"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                        <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5a.75.75 0 01.786-.711z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ))}

                {/* Add new criterion */}
                {addingCriterion ? (
                  <div>
                    <textarea
                      onBlur={(e) => {
                        if (cancelledRef.current) { cancelledRef.current = false; setAddingCriterion(false); }
                        else handleAddCriterion(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
                        if (e.key === 'Escape') { cancelledRef.current = true; e.currentTarget.blur(); }
                      }}
                      autoFocus
                      rows={1}
                      placeholder="New criterion..."
                      className="w-full resize-none rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm text-text-primary outline-none transition-colors duration-150 placeholder:text-text-muted focus:border-accent"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingCriterion(true)}
                    className="ml-3 flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors duration-150 hover:bg-surface hover:text-text-secondary"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
                    </svg>
                    Add criterion
                  </button>
                )}
              </div>

            </section>
          )}

          {/* Decisions */}
          <section>
            <div className="mb-1 flex items-center">
              <h4 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Decisions
              </h4>
              <UndoButton canUndo={canUndoDecision} onUndo={undoDecision} className="ml-auto" />
            </div>
            <div>
              {localDecisions.map((d) => (
                <div key={d.id} className="group/decision flex items-start gap-2">
                  <span className="mt-1.5 shrink-0 text-accent">&rarr;</span>
                  <div className="min-w-0 flex-1">
                    {editingDecisionId === d.id ? (
                      <textarea
                        defaultValue={d.text}
                        onBlur={(e) => {
                          if (cancelledRef.current) { cancelledRef.current = false; setEditingDecisionId(null); }
                          else handleSaveDecisionText(d.id, e.target.value);
                        }}
                        onKeyDown={(e) => { if (e.key === 'Escape') { cancelledRef.current = true; e.currentTarget.blur(); } }}
                        autoFocus
                        rows={1}
                        className="w-full resize-none rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm text-text-primary outline-none transition-colors duration-150 focus:border-accent"
                      />
                    ) : (
                      <div
                        onClick={() => setEditingDecisionId(d.id)}
                        className="group/dedit relative cursor-pointer rounded-lg border border-transparent px-3 py-1 text-sm text-text-secondary transition-all duration-150 hover:border-border hover:bg-surface"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="absolute right-2 top-1.5 h-3 w-3 text-text-muted opacity-0 transition-opacity duration-150 group-hover/dedit:opacity-100">
                          <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.463 11.1a.25.25 0 00-.064.108l-.563 1.97 1.971-.564a.25.25 0 00.108-.064l8.609-8.61a.25.25 0 000-.353l-1.097-1.097z" />
                        </svg>
                        <span className="break-words">{d.text}</span>
                        <span className="ml-2 font-mono text-[10px] text-text-muted">{d.date}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteDecision(d.id)}
                    className="mt-1 shrink-0 cursor-pointer rounded p-1 text-text-muted opacity-0 transition-all duration-150 hover:text-danger group-hover/decision:opacity-100"
                    aria-label="Delete decision"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5a.75.75 0 01.786-.711z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Add new decision */}
              {addingDecision ? (
                <div>
                  <textarea
                    onBlur={(e) => {
                      if (cancelledRef.current) { cancelledRef.current = false; setAddingDecision(false); }
                      else handleAddDecision(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
                      if (e.key === 'Escape') { cancelledRef.current = true; e.currentTarget.blur(); }
                    }}
                    autoFocus
                    rows={1}
                    placeholder="New decision..."
                    className="w-full resize-none rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm text-text-primary outline-none transition-colors duration-150 placeholder:text-text-muted focus:border-accent"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddingDecision(true)}
                  className="ml-3 flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors duration-150 hover:bg-surface hover:text-text-secondary"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
                  </svg>
                  Add decision
                </button>
              )}
            </div>
          </section>

          {/* Relationships */}
          <RelationshipsSection
            taskId={taskId}
            edges={edges}
            taskMap={taskMap}
            onSelectNode={onSelectNode}
            onGraphChange={onGraphChange}
          />

          {/* Files */}
          {files && files.length > 0 && (
            <section>
              <h4 className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Files
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {files.map((file) => {
                  const parts = file.split('/');
                  const filename = parts.pop() ?? file;
                  const dir = parts.length > 0 ? parts.join('/') + '/' : '';
                  return (
                    <span
                      key={file}
                      title={file}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised/50 px-2 py-1"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-text-muted">
                        <path d="M3.75 0A1.75 1.75 0 002 1.75v12.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 14.25V4.664a1.75 1.75 0 00-.513-1.237L10.573.513A1.75 1.75 0 009.336 0H3.75zm5.75 3.5v-2h.336a.25.25 0 01.177.073l2.914 2.914a.25.25 0 01.073.177V3.5H9.5zM3.75 1.5h4.75v2.25c0 .414.336.75.75.75h2.25v9.75a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25V1.75a.25.25 0 01.25-.25z" />
                      </svg>
                      <span className="font-mono text-[11px] max-w-[200px] overflow-hidden text-right" style={{ direction: 'rtl', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <bdi>{dir && <span className="text-text-muted">{dir}</span>}<span className="text-text-secondary">{filename}</span></bdi>
                      </span>
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {/* Execution Record */}
          {executionRecord && (
            <section>
              <h4 className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Execution Record
              </h4>
              <p className="whitespace-pre-wrap text-sm text-text-secondary">{executionRecord}</p>
            </section>
          )}
        </div>
      </div>

      {/* Collapse toggles */}
      <div className="flex shrink-0 items-center border-y border-border">
        <button
          onClick={toggleSpec}
          className="flex cursor-pointer items-center gap-2 px-5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:bg-surface-hover"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`h-3 w-3 transition-transform ${specCollapsed ? '' : 'rotate-180'}`}
          >
            <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
          </svg>
          {specCollapsed ? 'Show spec' : 'Hide spec'}
        </button>
        <span className="h-3 w-px bg-border" />
        <button
          onClick={toggleChat}
          className="flex cursor-pointer items-center gap-2 px-5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:bg-surface-hover"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`h-3 w-3 transition-transform ${chatCollapsed ? 'rotate-180' : ''}`}
          >
            <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
          </svg>
          {chatCollapsed ? 'Show chat' : 'Hide chat'}
        </button>
      </div>

      {historyError && (
        <div className="mx-5 mt-3 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-text-secondary">Failed to load chat history.</span>
          <button onClick={retryHistory} className="cursor-pointer text-xs font-semibold text-accent hover:underline">Retry</button>
        </div>
      )}

      {/* Refinement chat */}
      <div className={`transition-all duration-200 ${chatCollapsed ? 'h-0 overflow-hidden' : 'min-h-0 flex-1'}`}>
        {loadedHistory !== null ? (
          <RefineChatPanel
            taskId={taskId}
            projectId={projectId}
            initialMessages={loadedHistory}
            onGraphChange={onGraphChange}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <LoadingSpinner />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat sub-component
// ---------------------------------------------------------------------------

interface RefineChatPanelProps {
  /** @param taskId - UUID of the selected task. */
  taskId: string;
  /** @param projectId - UUID of the project. */
  projectId: string;
  /** @param initialMessages - Pre-loaded chat history. */
  initialMessages: UIMessage[];
  /** @param onGraphChange - Called after graph mutations to trigger re-fetch. */
  onGraphChange?: () => void;
}

/**
 * Refine chat panel that wraps useChat. Separated so it only mounts after
 * persisted history is fetched, ensuring initialMessages are correct.
 * @param props - Chat panel configuration.
 * @returns ChatPanel wired to useChat.
 */
function RefineChatPanel({ taskId, projectId, initialMessages, onGraphChange }: RefineChatPanelProps) {
  const settings = getSettings();

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { scope: 'refine', taskId: taskId, projectId, settings },
    }),
    id: `refine-${taskId}`,
    messages: initialMessages,
    onFinish: ({ message }) => {
      const hasToolCalls = message.parts?.some((p) => p.type.startsWith('tool-') || p.type === 'dynamic-tool');
      if (hasToolCalls) onGraphChange?.();
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  const handleSend = useCallback(
    (text: string) => { sendMessage({ text }); },
    [sendMessage],
  );

  const handleClear = useCallback(async () => {
    await fetch(`/api/project/${projectId}/conversations?taskId=${taskId}`, { method: 'DELETE' });
    setMessages([]);
  }, [projectId, taskId, setMessages]);

  const quickActions = [
    { label: 'Is scope too big?', onClick: () => handleSend('Is the scope of this task too big? Should it be split?') },
    { label: 'Add criteria', onClick: () => handleSend('Suggest acceptance criteria I might be missing.') },
    { label: 'What depends on this?', onClick: () => handleSend('What other tasks depend on this one?') },
    { label: 'Ready for planning', onClick: () => handleSend('This task looks good. Summarize what we defined and confirm it is ready for implementation planning.') },
  ];

  return (
    <ChatPanel
      messages={messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: getMessageText(m),
      }))}
      onSend={handleSend}
      isLoading={isLoading}
      quickActions={quickActions}
      placeholder="Type to refine this task..."
      onClear={handleClear}
      error={error}
    />
  );
}

// ---------------------------------------------------------------------------
// Relationships sub-component
// ---------------------------------------------------------------------------

/** Directional label for an edge relative to the current task. */
function edgeLabel(edge: TaskEdge, taskId: string): { label: string; color: string } {
  const isOutgoing = edge.sourceTaskId === taskId;
  if (edge.edgeType === 'depends_on') {
    return isOutgoing
      ? { label: 'Blocked by', color: 'text-depends' }
      : { label: 'Blocks', color: 'text-depends' };
  }
  return { label: 'Related to', color: 'text-relates' };
}

interface RelationshipsSectionProps {
  /** @param taskId - UUID of the current task. */
  taskId: string;
  /** @param edges - Edges connected to this task. */
  edges: TaskEdge[];
  /** @param taskMap - Map of task IDs to title+status. */
  taskMap: Map<string, { title: string; status: string }>;
  /** @param onSelectNode - Navigate to a connected task. */
  onSelectNode: (taskId: string) => void;
  /** @param onGraphChange - Refresh graph data after mutation. */
  onGraphChange?: () => void;
}

/**
 * Displays directional relationship labels with notes, delete, and inline edge creation.
 * @param props - Relationships section configuration.
 * @returns Relationships section with edge list and add form.
 */
/** User-facing relationship mode — maps to edge type + direction. */
type RelationMode = 'blocked_by' | 'blocks' | 'related_to';

const RELATION_MODES: { mode: RelationMode; label: string; accent: string }[] = [
  { mode: 'blocked_by', label: 'Blocked by', accent: 'depends' },
  { mode: 'blocks', label: 'Blocks', accent: 'depends' },
  { mode: 'related_to', label: 'Related to', accent: 'relates' },
];

function RelationshipsSection({
  taskId,
  edges,
  taskMap,
  onSelectNode,
  onGraphChange,
}: RelationshipsSectionProps) {
  const [adding, setAdding] = useState(false);
  const [relation, setRelation] = useState<RelationMode>('blocked_by');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset form when task changes
  useEffect(() => { setAdding(false); setError(null); }, [taskId]);

  // Focus search input when form opens
  useEffect(() => { if (adding) searchRef.current?.focus(); }, [adding]);

  // Focus note input when target is selected
  useEffect(() => { if (selectedTarget) noteRef.current?.focus(); }, [selectedTarget]);

  // Close dropdown on outside click
  useEffect(() => {
    if (selectedTarget || !search) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedTarget, search]);

  const connectedIds = new Set(edges.map((e) => e.sourceTaskId === taskId ? e.targetTaskId : e.sourceTaskId));

  const candidates = Array.from(taskMap.entries())
    .filter(([id]) => id !== taskId && !connectedIds.has(id))
    .filter(([, t]) => !search || t.title.toLowerCase().includes(search.toLowerCase()));

  const resetForm = () => {
    setAdding(false);
    setSelectedTarget(null);
    setNote('');
    setSearch('');
    setRelation('blocked_by');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedTarget || submitting) return;
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      setError('Note is required — describe why this relationship exists');
      noteRef.current?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const isBlocks = relation === 'blocks';
      await createEdge({
        sourceTaskId: isBlocks ? selectedTarget : taskId,
        targetTaskId: isBlocks ? taskId : selectedTarget,
        edgeType: relation === 'related_to' ? 'relates_to' : 'depends_on',
        note: trimmedNote,
      });
      resetForm();
      onGraphChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create edge');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (edgeId: string) => {
    await removeEdge(edgeId);
    onGraphChange?.();
  };

  return (
    <section>
      <h4 className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Relationships
      </h4>

      {/* Edge list */}
      {edges.length > 0 && (
        <div className="space-y-0.5">
          {edges.map((e) => {
            const otherId = e.sourceTaskId === taskId ? e.targetTaskId : e.sourceTaskId;
            const other = taskMap.get(otherId);
            const { label, color } = edgeLabel(e, taskId);
            return (
              <div key={e.id} className="group/edge -mx-1 rounded-lg px-3 py-1.5 transition-colors duration-100 hover:bg-surface">
                <div className="flex items-center gap-2">
                  <span className={`shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider ${color}`}>
                    {label}
                  </span>
                  <span className="text-text-muted/30 text-[10px]">&rsaquo;</span>
                  <button
                    onClick={() => onSelectNode(otherId)}
                    className="min-w-0 cursor-pointer truncate text-xs text-accent transition-colors hover:underline"
                  >
                    {other?.title ?? otherId.slice(0, 8)}
                  </button>
                  {other && (
                    <Badge status={other.status} className="ml-auto shrink-0 scale-90 opacity-60" />
                  )}
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="shrink-0 cursor-pointer rounded p-0.5 text-text-muted opacity-0 transition-all duration-150 hover:text-danger group-hover/edge:opacity-100"
                    aria-label="Remove relationship"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                    </svg>
                  </button>
                </div>
                {e.note && (
                  <p className="mt-0.5 pl-0.5 text-[11px] leading-tight text-text-muted">{e.note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add relationship form */}
      {adding ? (
        <div className="mt-2 overflow-hidden rounded-lg border border-border-strong/60 bg-surface-raised/40">
          {/* Relation mode toggle — segmented control */}
          <div className="flex border-b border-border">
            {RELATION_MODES.map(({ mode, label, accent }) => {
              const active = relation === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setRelation(mode)}
                  className={`relative flex-1 cursor-pointer py-2 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
                    active ? `text-${accent}` : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {label}
                  {active && (
                    <span className={`absolute inset-x-0 bottom-0 h-[2px] bg-${accent}`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-2 p-3">
            {/* Task search */}
            <div ref={dropdownRef} className="relative">
              <input
                ref={searchRef}
                type="text"
                value={selectedTarget ? (taskMap.get(selectedTarget)?.title ?? '') : search}
                onChange={(e) => { setSearch(e.target.value); setSelectedTarget(null); setError(null); }}
                onFocus={() => { if (selectedTarget) { setSearch(taskMap.get(selectedTarget)?.title ?? ''); setSelectedTarget(null); } }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') resetForm();
                }}
                placeholder="Search tasks..."
                className="w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors duration-150 placeholder:text-text-muted focus:border-accent"
              />
              {/* Dropdown */}
              {!selectedTarget && search && candidates.length > 0 && (
                <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-[140px] overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg shadow-black/20">
                  {candidates.slice(0, 8).map(([id, t]) => (
                    <button
                      key={id}
                      onClick={() => { setSelectedTarget(id); setSearch(''); setError(null); }}
                      className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-surface-hover"
                    >
                      <span className="min-w-0 truncate text-text-secondary">{t.title}</span>
                      <Badge status={t.status} className="ml-auto shrink-0 scale-75 opacity-50" />
                    </button>
                  ))}
                </div>
              )}
              {!selectedTarget && search && candidates.length === 0 && (
                <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-[11px] text-text-muted shadow-lg shadow-black/20">
                  No matching tasks
                </div>
              )}
            </div>

            {/* Note — required, always visible after target selection */}
            {selectedTarget && (
              <input
                ref={noteRef}
                type="text"
                value={note}
                onChange={(e) => { setNote(e.target.value); if (error) setError(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                  if (e.key === 'Escape') resetForm();
                }}
                placeholder="Why does this relationship exist?"
                maxLength={255}
                className="w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors duration-150 placeholder:text-text-muted focus:border-accent"
              />
            )}

            {/* Error */}
            {error && (
              <p className="text-[11px] text-danger">{error}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSubmit}
                disabled={!selectedTarget || submitting}
                className="cursor-pointer rounded-md bg-accent/15 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent transition-all duration-150 hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={resetForm}
                className="cursor-pointer rounded-md px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="ml-3 flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors duration-150 hover:bg-surface hover:text-text-secondary"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
            <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
          </svg>
          Add relationship
        </button>
      )}
    </section>
  );
}

export default TaskTab;
