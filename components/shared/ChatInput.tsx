'use client';

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';

interface ChatInputProps {
  /** @param onSend - Called with the message text when the user sends. */
  onSend: (message: string) => void;
  /** @param placeholder - Input placeholder text. */
  placeholder?: string;
  /** @param isLoading - Shows pulsing dots and disables input. */
  isLoading?: boolean;
  /** @param disabled - Disables the input entirely. */
  disabled?: boolean;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Auto-resizing chat text input with send button.
 * @param props - Chat input configuration.
 * @returns A styled chat input element.
 */
export function ChatInput({
  onSend,
  placeholder = 'Type a message…',
  isLoading = false,
  disabled = false,
  className = '',
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 6 * 24; // ~6 lines
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  const send = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send],
  );

  const canSend = value.trim().length > 0 && !isLoading && !disabled;

  return (
    <div className={`relative flex items-end gap-2 ${className}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading || disabled}
        rows={1}
        className="flex-1 resize-none rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent disabled:opacity-50"
      />
      <button
        onClick={send}
        disabled={!canSend}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
          canSend
            ? 'bg-accent text-white cursor-pointer hover:brightness-110'
            : 'bg-surface-raised text-text-muted cursor-not-allowed'
        }`}
      >
        {isLoading ? (
          <span className="flex gap-0.5">
            <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
          </span>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M10 3a.75.75 0 01.75.75v10.19l2.72-2.72a.75.75 0 111.06 1.06l-4 4a.75.75 0 01-1.06 0l-4-4a.75.75 0 111.06-1.06l2.72 2.72V3.75A.75.75 0 0110 3z"
              clipRule="evenodd"
              transform="rotate(180 10 10)"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

export default ChatInput;
