'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useCallback, useState } from 'react';

interface CopyButtonProps {
  /** @param text - Text to copy to clipboard. */
  text: string;
  /** @param label - Button label (default "Copy"). */
  label?: string;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Copy-to-clipboard button with confirmation flash.
 * @param props - Copy button configuration.
 * @returns A styled copy button element.
 */
export function CopyButton({ text, label = 'Copy', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleCopy}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[--radius-md] border px-3 py-1.5 font-mono text-xs transition-colors min-h-9 ${
        copied
          ? 'border-done text-done bg-done-bg'
          : 'border-border-strong text-text-secondary hover:border-accent'
      } ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.svg
            key="check"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.15 }}
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5"
          >
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
          </motion.svg>
        ) : (
          <motion.svg
            key="copy"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.15 }}
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5"
          >
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
          </motion.svg>
        )}
      </AnimatePresence>
      <span aria-live="polite">{copied ? 'Copied!' : label}</span>
    </motion.button>
  );
}

export default CopyButton;
