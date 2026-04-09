'use client';

import { useState, useEffect, useCallback } from 'react';

interface CooldownBannerProps {
  /** @param error - Error object from useChat or similar. */
  error: Error | undefined;
  /** @param onRetry - Called when cooldown expires or user clicks retry. */
  onRetry?: () => void;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Displays a cooldown banner when AI rate limits are hit.
 * Auto-counts down and triggers retry when ready.
 * @param props - CooldownBanner configuration.
 * @returns A banner with countdown timer, or null if no error.
 */
export function CooldownBanner({ error, onRetry, className = '' }: CooldownBannerProps) {
  const [seconds, setSeconds] = useState(0);
  const [trackedError, setTrackedError] = useState<Error | undefined>(undefined);

  const isRateLimit = error?.message?.toLowerCase().includes('rate')
    || error?.message?.includes('429')
    || error?.message?.includes('quota')
    || error?.message?.includes('cooldown');

  if (error !== trackedError) {
    setTrackedError(error);
    if (!error || !isRateLimit) {
      setSeconds(0);
    } else {
      const match = error.message.match(/(\d+)\s*second/);
      setSeconds(match ? parseInt(match[1], 10) : 30);
    }
  }

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  const handleRetry = useCallback(() => {
    setSeconds(0);
    onRetry?.();
  }, [onRetry]);

  if (!error || !isRateLimit) return null;

  return (
    <div role="alert" aria-live="polite" className={`flex items-center gap-3 rounded-lg border border-accent/20 bg-accent-glow px-4 py-3 ${className}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-sm font-semibold text-accent">
        {seconds > 0 ? seconds : '!'}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">
          {seconds > 0 ? 'AI is cooling down' : 'Ready to retry'}
        </p>
        <p className="text-xs text-text-secondary">
          {seconds > 0
            ? `Free tier rate limit reached. Resuming in ${seconds}s...`
            : 'Rate limit window has passed.'}
        </p>
      </div>
      {seconds === 0 && onRetry && (
        <button
          onClick={handleRetry}
          className="min-h-9 cursor-pointer rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
        >
          Retry
        </button>
      )}
    </div>
  );
}
