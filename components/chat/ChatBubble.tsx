'use client';

import Markdown from 'react-markdown';
import { ToolCallDisplay } from './ToolCallDisplay';

interface ChatBubbleProps {
  /** @param role - Message sender role. */
  role: 'user' | 'assistant';
  /** @param content - Message text content (supports markdown). */
  content: string;
  /** @param toolCalls - Optional tool calls to display. */
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
  /** @param isFirstInGroup - Whether this is the first message in a consecutive same-role group. */
  isFirstInGroup?: boolean;
  /** @param isLastInGroup - Whether this is the last message in a consecutive same-role group. */
  isLastInGroup?: boolean;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Single chat message bubble with role-based styling and markdown rendering.
 * @param props - Chat bubble configuration.
 * @returns A styled chat message element.
 */
export function ChatBubble({ role, content, toolCalls, isFirstInGroup = true, isLastInGroup = true, className = '' }: ChatBubbleProps) {
  const isUser = role === 'user';

  const groupingMargin = !isFirstInGroup ? '-mt-2' : '';
  const topRadius = isUser
    ? (!isFirstInGroup ? 'rounded-tr-md' : '')
    : (!isFirstInGroup ? 'rounded-tl-md' : '');
  const tailRadius = isUser
    ? (isLastInGroup ? 'rounded-br-md' : '')
    : (isLastInGroup ? 'rounded-bl-md' : '');

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${groupingMargin} ${className}`}>
      <div
        className={`max-w-[85%] lg:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${topRadius} ${
          isUser
            ? `bg-accent/10 text-text-primary ${tailRadius}`
            : `bg-surface-raised text-text-primary border border-border ${tailRadius}`
        }`}
      >
        {isUser ? (
          <p className="m-0 whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose-chat">
            <Markdown>{content}</Markdown>
          </div>
        )}
        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {toolCalls.map((tc) => (
              <ToolCallDisplay key={tc.id} name={tc.name} args={tc.args} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatBubble;
