'use client';

import { useState, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { getSettings } from '@/lib/settings';
import { getMessageText, convertPersistedToUIMessages } from '@/lib/chat-helpers';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface ProjectChatProps {
  /** @param projectId - UUID of the project. */
  projectId: string;
  /** @param onGraphChange - Called after graph mutations to trigger re-fetch. */
  onGraphChange?: () => void;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Project-level AI chat displayed when no node is selected.
 * @param props - Project chat configuration.
 * @returns Full-height chat panel for project-level conversation.
 */
export function ProjectChat({ projectId, onGraphChange, className = '' }: ProjectChatProps) {
  const [loadedHistory, setLoadedHistory] = useState<UIMessage[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [prevProjectId, setPrevProjectId] = useState(projectId);

  if (projectId !== prevProjectId) {
    setPrevProjectId(projectId);
    setLoadedHistory(null);
    setHistoryError(false);
  }

  // Load persisted chat history
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/project/${projectId}/conversations`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setLoadedHistory(convertPersistedToUIMessages(data.messages ?? [])); })
      .catch((err) => { if (!cancelled) { console.error('[chat] history fetch failed:', err); setHistoryError(true); setLoadedHistory([]); } });
    return () => { cancelled = true; };
  }, [projectId]);

  const retryHistory = useCallback(() => {
    setHistoryError(false);
    setLoadedHistory(null);
    fetch(`/api/project/${projectId}/conversations`)
      .then((r) => r.json())
      .then((data) => setLoadedHistory(convertPersistedToUIMessages(data.messages ?? [])))
      .catch((err) => { console.error('[chat] history fetch failed:', err); setHistoryError(true); setLoadedHistory([]); });
  }, [projectId]);

  return (
    <div className={`flex h-full flex-col ${className}`}>
      <div className="shrink-0 border-b border-border px-5 py-3.5">
        <h2 className="text-lg font-semibold text-text-primary">
          Project Chat
        </h2>
        <p className="text-xs text-text-muted">
          Ask about your project, make structural changes, or get advice.
        </p>
      </div>

      {historyError && (
        <div className="mx-5 mt-3 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-text-secondary">Failed to load chat history.</span>
          <button onClick={retryHistory} className="cursor-pointer text-xs font-semibold text-accent hover:underline">Retry</button>
        </div>
      )}

      <div className="flex-1 overflow-hidden min-w-0">
        {loadedHistory !== null ? (
          <ProjectChatPanel
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
// Chat sub-component — mounts only after history is loaded
// ---------------------------------------------------------------------------

interface ProjectChatPanelProps {
  /** @param projectId - UUID of the project. */
  projectId: string;
  /** @param initialMessages - Pre-loaded chat history. */
  initialMessages: UIMessage[];
  /** @param onGraphChange - Called after graph mutations to trigger re-fetch. */
  onGraphChange?: () => void;
}

/**
 * Project chat panel wrapping useChat. Separated so it only mounts after
 * persisted history is fetched.
 * @param props - Chat panel configuration.
 * @returns ChatPanel wired to useChat.
 */
function ProjectChatPanel({ projectId, initialMessages, onGraphChange }: ProjectChatPanelProps) {
  const settings = getSettings();

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { scope: 'projectChat', projectId, settings },
    }),
    id: `project-${projectId}`,
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
    await fetch(`/api/project/${projectId}/conversations`, { method: 'DELETE' });
    setMessages([]);
  }, [projectId, setMessages]);

  const quickActions = [
    { label: 'What should I work on?', onClick: () => handleSend('What should I work on next?') },
    { label: 'Add a task', onClick: () => handleSend('I want to add a new task.') },
    { label: 'Show project summary', onClick: () => handleSend('Give me a summary of the project status.') },
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
      onClear={handleClear}
      placeholder="Type about the project..."
      error={error}
    />
  );
}

export default ProjectChat;
