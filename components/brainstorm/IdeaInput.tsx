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
      <h1 className="font-display text-3xl font-bold text-gradient mb-3">
        What are you building?
      </h1>
      <p className="text-text-secondary mb-8 text-center max-w-md">
        Describe your project idea. Be as detailed or rough as you like.
      </p>

      <textarea
        ref={textareaRef}
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="A habit tracker app that helps people build daily routines with streaks and reminders..."
        rows={5}
        className="mb-6 w-full max-w-lg resize-none rounded-xl border border-border-strong bg-surface px-5 py-4 text-sm leading-relaxed text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent"
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
