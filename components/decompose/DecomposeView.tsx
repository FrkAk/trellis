'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { motion, AnimatePresence } from 'motion/react';
import { TopBar } from '@/components/layout/TopBar';
import { PageShell } from '@/components/layout/PageShell';
import { ChatInput } from '@/components/shared/ChatInput';
import { CooldownBanner } from '@/components/shared/CooldownBanner';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import Markdown from 'react-markdown';
import { getSettings } from '@/lib/settings';
import { getMessageText, convertPersistedToUIMessages } from '@/lib/chat-helpers';
import { isPlannable, isReady, buildStatusMap } from '@/lib/ui/taskState';
import type { Task, TaskEdge } from '@/lib/db/schema';
import type { Message as DbMessage } from '@/lib/types';

/** Reserved UUID to store decompose conversations separately from brainstorm. */
const DECOMPOSE_CONVO_ID = '00000000-0000-0000-0000-000000000001';

interface ProjectGraph {
  title: string;
  tasks: Task[];
  edges: TaskEdge[];
}

interface DecomposeViewProps {
  projectId: string;
  /** @param initialTaskCount - Pre-existing task count from phase guard, used to prevent re-fire. */
  initialTaskCount?: number;
}

/**
 * Decompose page -- live view of AI building the project task structure.
 * Recovers persisted conversation on refresh to avoid re-triggering decomposition.
 * @param props - Component props with projectId.
 * @returns The decompose flow UI.
 */
export function DecomposeView({ projectId, initialTaskCount }: DecomposeViewProps) {
  const router = useRouter();
  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const decomposeStatusMap = useMemo(() => graph ? buildStatusMap(graph.tasks) : new Map<string, string>(), [graph]);
  const [prevCounts, setPrevCounts] = useState({ tasks: 0, edges: 0 });
  const [isComplete, setIsComplete] = useState(false);
  const [recoveredMessages, setRecoveredMessages] = useState<UIMessage[] | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [graphError, setGraphError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const decomposeSentRef = useRef(false);
  const settings = getSettings();

  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch(`/api/project/${projectId}/graph`);
      if (res.ok) {
        const data = await res.json();
        setGraph(data);
        setGraphError(false);
      }
    } catch (err) {
      console.error('[decompose] graph fetch failed:', err);
      setGraphError(true);
    }
  }, [projectId]);

  // Recover persisted conversation on mount
  useEffect(() => {
    async function loadPersistedMessages() {
      try {
        const res = await fetch(`/api/project/${projectId}/conversations?taskId=${DECOMPOSE_CONVO_ID}`);
        if (res.ok) {
          const { messages: dbMessages } = await res.json() as { messages: DbMessage[] };
          if (dbMessages?.length) {
            setRecoveredMessages(convertPersistedToUIMessages(dbMessages));
          }
        }
      } catch (err) {
        console.warn("[decompose] conversation recovery failed:", err);
      }
      setReady(true);
    }
    loadPersistedMessages();
  }, [projectId]);

  const hasRecoveredMessages = recoveredMessages && recoveredMessages.length > 0;

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { scope: 'decompose', projectId, taskId: DECOMPOSE_CONVO_ID, settings },
    }),
    id: `decompose-${projectId}`,
    ...(hasRecoveredMessages ? { messages: recoveredMessages } : {}),
    onFinish: () => {
      fetchGraph();
      setIsComplete(true);
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    if (!ready || decomposeSentRef.current) return;
    if (messages.length === 0 && !hasRecoveredMessages && (initialTaskCount ?? 0) === 0) {
      decomposeSentRef.current = true;
      sendMessage({
        text: 'Decompose this project into tasks. For every task, write a detailed description (2-4 sentences) and 2-4 concrete acceptance criteria. Tag tasks by area/concern. Then create edges for dependencies.',
      });
    }
  }, [ready, messages.length, hasRecoveredMessages, sendMessage, initialTaskCount]);

  // If recovered with messages or tasks already exist, mark as complete
  if (!isComplete && !isLoading && (hasRecoveredMessages || (initialTaskCount ?? 0) > 0)) {
    setIsComplete(true);
  }

  // Initial graph fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/project/${projectId}/graph`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setGraph(data);
          setGraphError(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[decompose] graph fetch failed:', err);
        setGraphError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(fetchGraph, 4000);
    return () => clearInterval(interval);
  }, [isLoading, fetchGraph]);

  const totalTasks = graph?.tasks.length ?? 0;
  const totalEdges = graph?.edges.length ?? 0;

  if (totalTasks !== prevCounts.tasks || totalEdges !== prevCounts.edges) {
    setPrevCounts({ tasks: totalTasks, edges: totalEdges });
  }

  const lastAssistantMessage = useMemo(() => {
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    if (assistantMsgs.length === 0) return null;
    const text = getMessageText(assistantMsgs[assistantMsgs.length - 1]);
    return text?.trim() ? text : null;
  }, [messages]);

  useEffect(() => {
    if (isLoading && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [totalTasks, isLoading]);

  return (
    <>
      <TopBar projectName={graph?.title ?? 'New Project'} stageLabel="Decompose" />
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-text-primary mb-1">Decompose</h1>
          <p className="text-sm text-text-muted truncate">{graph?.title ?? 'New Project'}</p>
        </div>

        {/* === STATUS STRIP === */}
        <motion.div
          layout
          className="mb-8 overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]"
        >
          {/* Progress bar */}
          <div className="h-0.5 w-full bg-surface-raised">
            <motion.div
              className={`h-full bg-gradient-to-r from-accent to-done ${!isComplete ? 'progress-shimmer' : ''}`}
              initial={{ width: '0%' }}
              animate={{
                width: isComplete
                  ? '100%'
                  : totalTasks === 0
                    ? '2%'
                    : `${Math.min(95, (totalTasks / Math.max(totalTasks + 5, 1)) * 100)}%`,
              }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>

          <div className="flex items-center gap-6 px-5 py-3">
            {/* Status indicator */}
            <div className="flex items-center gap-2.5">
              {isLoading ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
              ) : isComplete ? (
                <svg className="h-3.5 w-3.5 text-done" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Zm3.78-9.72a.75.75 0 0 0-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25Z" clipRule="evenodd" />
                </svg>
              ) : (
                <span className="h-2 w-2 rounded-full bg-text-muted" />
              )}
              <span className="font-mono text-xs font-medium tracking-wide text-text-secondary">
                {isComplete
                  ? 'Structure complete'
                  : isLoading
                    ? totalTasks > 0
                      ? `Creating tasks... (${totalTasks} so far)`
                      : 'Analyzing project...'
                    : 'Ready'}
              </span>
            </div>

            {/* Counters */}
            <div className="flex items-center gap-4 ml-auto">
              <CounterPill label="Tasks" value={totalTasks} />
              <CounterPill label="Edges" value={totalEdges} />
            </div>
          </div>
        </motion.div>

        {/* === AI ANNOTATION === */}
        <AnimatePresence mode="wait">
          {lastAssistantMessage && isLoading && (
            <motion.div
              key={lastAssistantMessage.slice(0, 40)}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="mb-6 flex gap-3"
            >
              <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10">
                <svg className="h-2.5 w-2.5 text-accent" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0Zm-.5 3a.5.5 0 0 1 1 0v3.5a.5.5 0 0 1-1 0V3Zm.5 6.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1 rounded-lg border border-accent/10 bg-accent/[0.03] px-4 py-3">
                <div className="prose-chat text-xs leading-relaxed text-text-secondary">
                  <Markdown>{lastAssistantMessage}</Markdown>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {graphError && (
          <div className="mb-6 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-text-secondary">Failed to load project graph.</span>
            <button onClick={fetchGraph} className="cursor-pointer text-xs font-semibold text-accent hover:underline">Retry</button>
          </div>
        )}

        {/* === EMPTY STATE === */}
        {totalTasks === 0 && isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4">
              <LoadingSpinner />
            </div>
            <p className="font-mono text-xs tracking-wide text-text-muted">
              Analyzing project structure...
            </p>
          </div>
        )}

        {/* === TASK LIST === */}
        {totalTasks > 0 && graph && (
          <div className="relative mb-8 space-y-2">
            <AnimatePresence initial={false}>
              {graph.tasks
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="flex items-center gap-3 rounded-lg border-l-2 border-accent/20 bg-surface-raised/50 px-4 py-2.5 transition-colors hover:bg-surface-raised/80"
                  >
                    <span className="inline-flex shrink-0 items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${taskStatusChip(task.status)}`}>
                        {taskStatusLabel(task.status)}
                      </span>
                      {isPlannable(task) && (
                        <span className="rounded bg-planned/15 px-1 py-px font-mono text-[9px] font-semibold text-planned">
                          plannable
                        </span>
                      )}
                      {graph && isReady(task, decomposeStatusMap, graph.edges) && (
                        <span className="rounded bg-progress/15 px-1 py-px font-mono text-[9px] font-semibold text-progress">
                          ready
                        </span>
                      )}
                    </span>
                    <span className="flex-1 text-sm text-text-primary/80">
                      {task.title}
                    </span>
                    {task.tags.length > 0 && (
                      <div className="flex gap-1">
                        {task.tags.map((tag) => (
                          <span key={tag} className="rounded-md bg-accent/8 px-1.5 py-0.5 font-mono text-[10px] text-accent-light">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        )}

        {/* === FINAL ASSISTANT MESSAGE (when done) === */}
        {isComplete && !isLoading && messages.filter((m) => m.role === 'assistant').length > 0 && (
          <div className="mb-6">
            {messages.filter((m) => m.role === 'assistant').slice(-1).map((msg) => {
              const text = getMessageText(msg);
              if (!text?.trim()) return null;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-xl border border-border bg-surface/40 px-5 py-4 shadow-[var(--shadow-card)]"
                >
                  <div className="prose-chat text-sm text-text-secondary">
                    <Markdown>{text}</Markdown>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* === COMPLETION BANNER === */}
        <AnimatePresence>
          {isComplete && !isLoading && totalTasks > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="mb-6 overflow-hidden rounded-xl border border-done/20 bg-done/[0.04]"
            >
              <div className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <svg className="h-4 w-4 text-done" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Zm3.78-9.72a.75.75 0 0 0-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25Z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-text-primary">
                    Project structure complete
                  </span>
                </div>
                <p className="mt-2 text-xs text-text-secondary">
                  {totalTasks} tasks and {totalEdges} edges ready for refinement.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />

        {/* Sticky input area */}
        <div className="sticky bottom-0 -mx-6 lg:-mx-8 border-t border-border bg-base/95 px-6 lg:px-8 pb-6 pt-3 backdrop-blur-sm">
          {error && <CooldownBanner error={error} className="mb-3" />}
          <ChatInput
            onSend={(text) => sendMessage({ text })}
            isLoading={isLoading}
            placeholder="Ask to restructure, add tasks, split tasks..."
          />
          <div className="mt-4 flex items-center justify-between">
            <Button variant="ghost" onClick={() => router.push(`/new/brainstorm?projectId=${projectId}`)}>
              &larr; Back
            </Button>
            <Button
              variant="primary"
              disabled={totalTasks === 0}
              onClick={() => router.push(`/new/review?projectId=${projectId}`)}
            >
              {isComplete ? 'Review structure' : 'This looks right'} &rarr;
            </Button>
          </div>
        </div>
      </PageShell>
    </>
  );
}

/**
 * Map task status to chip classes.
 * @param status - Task status string.
 * @returns Tailwind classes.
 */
function taskStatusChip(status: string): string {
  switch (status) {
    case 'done': return 'bg-done/15 text-done';
    case 'planned': return 'bg-planned/15 text-planned';
    case 'in_progress': return 'bg-progress/15 text-progress';
    default: return 'bg-text-muted/10 text-text-muted';
  }
}

/**
 * Map task status to short label.
 * @param status - Task status string.
 * @returns Short label.
 */
function taskStatusLabel(status: string): string {
  switch (status) {
    case 'done': return 'Done';
    case 'planned': return 'Planned';
    case 'in_progress': return 'In Progress';
    default: return 'Draft';
  }
}

/**
 * Animated counter pill for the status strip.
 * @param props - Label and numeric value.
 * @returns A styled counter element.
 */
function CounterPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.15 }}
          className="inline-block font-mono text-sm font-semibold tabular-nums text-text-primary"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
