'use client';

import { useMemo } from 'react';
import { CopyButton } from '@/components/shared/CopyButton';
import { Markdown } from '@/components/shared/Markdown';

interface ContextTabProps {
  /** @param contextText - Pre-built context string from CRI. */
  contextText: string;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Context tab displaying token-dense context package with copy action.
 * @param props - Context tab configuration.
 * @returns Context display with copy action.
 */
export function ContextTab({
  contextText,
  className = '',
}: ContextTabProps) {
  const tokenEstimate = useMemo(() => {
    return Math.round(contextText.length / 4);
  }, [contextText]);

  if (!contextText.trim()) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <p className="text-sm text-text-secondary">No context available</p>
        <p className="mt-1 text-xs text-text-muted">Add a description and criteria to generate context.</p>
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto p-5 space-y-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="mb-1 text-sm font-semibold text-text-primary">
            Execution Context
          </h4>
          <p className="text-xs text-text-secondary">
            Token-dense context package for your coding agent. The implementation plan is the primary payload.
          </p>
        </div>
        <CopyButton text={contextText} />
      </div>

      <Markdown variant="spec" className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-text-secondary leading-relaxed">{contextText}</Markdown>

      <span className="block font-mono text-[10px] text-text-muted">
        ~{tokenEstimate.toLocaleString()} tokens
      </span>
    </div>
  );
}

export default ContextTab;
