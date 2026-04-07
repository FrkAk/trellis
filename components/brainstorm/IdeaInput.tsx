'use client';

import { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/shared/Button';

interface IdeaInputProps {
  /** @param onSubmit - Called with the idea text when user clicks explore. */
  onSubmit: (idea: string) => void;
}

/**
 * Large text area for initial project idea input.
 * @param props - IdeaInput configuration.
 * @returns A centered idea input form.
 */
export function IdeaInput({ onSubmit }: IdeaInputProps) {
  const [idea, setIdea] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex min-h-[60vh] flex-col items-center justify-center"
    >
      <h1 className="text-2xl font-semibold text-text-primary mb-2">
        What are you building?
      </h1>
      <p className="text-sm text-text-muted mb-8 text-center max-w-sm">
        Describe your project idea. Be as detailed or rough as you like.
      </p>

      <textarea
        ref={textareaRef}
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="A habit tracker app that helps people build daily routines with streaks and reminders..."
        rows={5}
        className="mb-6 w-full max-w-lg resize-none rounded-xl border border-border bg-surface px-5 py-4 text-sm leading-relaxed text-text-primary placeholder:text-text-muted outline-none transition-all focus:border-accent/40 shadow-[var(--shadow-card)] focus:shadow-[var(--shadow-card-hover)]"
      />

      <Button
        variant="primary"
        size="lg"
        disabled={idea.trim().length === 0}
        onClick={() => onSubmit(idea.trim())}
      >
        Let&apos;s explore &rarr;
      </Button>
    </motion.div>
  );
}

export default IdeaInput;
