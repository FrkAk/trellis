'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { motion, AnimatePresence } from 'motion/react';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatInput } from '@/components/shared/ChatInput';
import { CooldownBanner } from '@/components/shared/CooldownBanner';
import { Button } from '@/components/shared/Button';
import { updateProjectStatus } from '@/lib/actions/project';
import { getSettings } from '@/lib/settings';
import { getMessageText } from '@/lib/chat-helpers';

interface ConversationViewProps {
  /** @param initialIdea - The user's original idea text. */
  initialIdea: string;
  /** @param projectId - UUID of the project in the database. */
  projectId: string;
  /** @param onStartOver - Called when user clicks "Start over". */
  onStartOver: () => void;
  /** @param initialMessages - Persisted messages to restore on refresh. */
  initialMessages?: UIMessage[];
}

/**
 * Chat conversation view powered by real AI via Vercel AI SDK v6.
 * Sends the initial idea to the AI on mount.
 * @param props - Conversation view configuration.
 * @returns A chat conversation interface with real AI responses.
 */
export function ConversationView({ initialIdea, projectId, onStartOver, initialMessages }: ConversationViewProps) {
  const router = useRouter();
  const sentRef = useRef(false);
  const settings = getSettings();
  const isRecovery = initialMessages && initialMessages.length > 0;

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { scope: 'brainstorm', projectId, settings },
    }),
    id: `brainstorm-${projectId}`,
    ...(isRecovery ? { messages: initialMessages } : {}),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  const brainstormReady = useMemo(() => {
    const hasToolSignal = messages.some((msg) =>
      msg.parts?.some((p) => {
        if (p.type !== 'tool-invocation') return false;
        const name = (p as { toolInvocation?: { toolName?: string } }).toolInvocation?.toolName;
        return name === 'signalBrainstormComplete' || name === 'updateProject';
      }),
    );
    if (hasToolSignal) return true;
    // Fallback: show after enough conversation when AI skips the tool call
    return messages.filter((m) => m.role === 'assistant').length >= 3;
  }, [messages]);

  // Send the initial idea on mount (skip if recovering from persisted messages)
  useEffect(() => {
    if (!sentRef.current && !isRecovery) {
      sentRef.current = true;
      sendMessage({ text: initialIdea });
    }
  }, [sendMessage, initialIdea, isRecovery]);

  const handleSend = useCallback(
    (text: string) => {
      sendMessage({ text });
    },
    [sendMessage],
  );

  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleComplete = useCallback(async () => {
    try {
      setTransitionError(null);
      setIsTransitioning(true);
      const result = await updateProjectStatus(projectId, 'decomposing');
      if (!result.ok) throw new Error(result.message);
      router.push(`/new/decompose?projectId=${projectId}`);
    } catch (err) {
      console.error('[brainstorm] failed to advance phase:', err);
      setIsTransitioning(false);
      setTransitionError('Failed to save progress. Please try again.');
    }
  }, [projectId, router]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Messages */}
      <div className="flex flex-col gap-4 pb-4">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            role={msg.role as 'user' | 'assistant'}
            content={getMessageText(msg)}
          />
        ))}
        {isLoading && (
          <div className="flex gap-1 px-4 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent/40" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent/40 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent/40 [animation-delay:300ms]" />
          </div>
        )}
      </div>

      {/* Sticky input area */}
      <div className="sticky bottom-0 -mx-6 lg:-mx-8 border-t border-border bg-base/95 px-6 lg:px-8 pb-6 pt-3 backdrop-blur-sm">
        {error && <CooldownBanner error={error} className="mb-3" />}
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          placeholder="Continue the conversation..."
        />
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" onClick={onStartOver}>
            &larr; Start over
          </Button>
          <AnimatePresence>
            {brainstormReady && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex flex-col items-end gap-1"
              >
                <Button variant="primary" onClick={handleComplete} isLoading={isTransitioning}>
                  Proceed to decompose &rarr;
                </Button>
                {transitionError && (
                  <p className="text-xs text-red-400">{transitionError}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
