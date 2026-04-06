'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ChatBubble } from './ChatBubble';
import { ChatInput } from '@/components/shared/ChatInput';
import { QuickActions } from '@/components/shared/QuickActions';
import { CooldownBanner } from '@/components/shared/CooldownBanner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
}

interface ChatPanelProps {
  /** @param messages - Array of chat messages to display. */
  messages: Message[];
  /** @param onSend - Called when user sends a message. */
  onSend: (message: string) => void;
  /** @param isLoading - Whether a response is being generated. */
  isLoading: boolean;
  /** @param quickActions - Optional contextual action pills. */
  quickActions?: { label: string; onClick: () => void }[];
  /** @param placeholder - Chat input placeholder text. */
  placeholder?: string;
  /** @param onClear - Called when user clicks the clear chat button. */
  onClear?: () => void;
  /** @param error - Error from useChat, used to show cooldown banner. */
  error?: Error;
  /** @param onRetry - Called when user clicks retry after cooldown. */
  onRetry?: () => void;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Complete chat interface with scrollable messages, input, and quick actions.
 * @param props - Chat panel configuration.
 * @returns A full chat panel element.
 */
export function ChatPanel({
  messages,
  onSend,
  isLoading,
  quickActions,
  placeholder,
  onClear,
  error,
  onRetry,
  className = '',
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Auto-scroll only when near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Track scroll position for scroll-to-bottom button
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Auto-dismiss clear confirmation
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  return (
    <div className={`flex h-full flex-col min-w-0 ${className}`}>
      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 min-w-0">
        {onClear && messages.length > 0 && (
          <div className="mb-3 flex justify-end">
            {confirmClear ? (
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <span className="text-text-muted">Clear all messages?</span>
                <button
                  onClick={() => { onClear(); setConfirmClear(false); }}
                  className="cursor-pointer text-danger hover:underline"
                >
                  Yes, clear
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="cursor-pointer text-text-muted hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="cursor-pointer rounded px-2 py-1 font-mono text-[10px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
              >
                Clear chat
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-4">
          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const isFirstInGroup = !prev || prev.role !== msg.role;
            const isLastInGroup = !next || next.role !== msg.role;
            return (
              <ChatBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                toolCalls={msg.toolCalls}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
              />
            );
          })}
        </div>
        <div ref={bottomRef} />
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-2 left-full -mr-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-sm transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Scroll to bottom"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path d="M8 10.94l-3.72-3.72a.75.75 0 00-1.06 1.06l4.25 4.25a.75.75 0 001.06 0l4.25-4.25a.75.75 0 10-1.06-1.06L8 10.94z" />
            </svg>
          </button>
        )}
      </div>

      {/* Quick actions + input */}
      <div className="shrink-0 border-t border-border px-5 py-2.5 space-y-2">
        {error && <CooldownBanner error={error} onRetry={onRetry} />}
        {quickActions && quickActions.length > 0 && !error && (
          <QuickActions actions={quickActions} />
        )}
        <ChatInput onSend={onSend} isLoading={isLoading} placeholder={placeholder} />
      </div>
    </div>
  );
}

export default ChatPanel;
