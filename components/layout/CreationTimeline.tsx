'use client';

import { motion } from 'motion/react';

interface Step {
  label: string;
  sub: string;
}

const STEPS: Step[] = [
  { label: 'Brainstorm', sub: 'Shape your idea' },
  { label: 'Decompose', sub: 'Build structure' },
  { label: 'Review', sub: 'Confirm & launch' },
];

interface CreationTimelineProps {
  /** @param currentStep - Active step (1-indexed). */
  currentStep: 1 | 2 | 3;
}

/**
 * Vertical progress timeline for the project creation flow.
 * Fixed to the left side on desktop, hidden on mobile.
 * @param props - Timeline configuration.
 * @returns A fixed-position vertical timeline element.
 */
export function CreationTimeline({ currentStep }: CreationTimelineProps) {
  return (
    <>
      {/* Desktop: vertical sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 z-40 hidden w-[220px] flex-col border-r border-border bg-surface/60 pt-[var(--topbar-h)] backdrop-blur-sm lg:flex">
        {/* Gradient accent on right border */}
        <div className="absolute right-0 top-[var(--topbar-h)] h-40 w-px bg-gradient-to-b from-accent/20 via-accent/5 to-transparent" />

        <nav className="flex flex-1 flex-col justify-center px-6 py-10">
          {STEPS.map((step, i) => {
            const stepNum = i + 1;
            const isComplete = stepNum < currentStep;
            const isActive = stepNum === currentStep;

            return (
              <div key={step.label}>
                {/* Step item */}
                <div className="flex items-center gap-4">
                  {/* Circle */}
                  <motion.div
                    animate={
                      isActive
                        ? {
                            boxShadow: [
                              '0 0 0 0px rgba(224, 145, 0, 0)',
                              '0 0 0 6px rgba(224, 145, 0, 0.12)',
                              '0 0 0 0px rgba(224, 145, 0, 0)',
                            ],
                          }
                        : { boxShadow: '0 0 0 0px rgba(224, 145, 0, 0)' }
                    }
                    transition={
                      isActive
                        ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
                        : { duration: 0.3 }
                    }
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-500 ${
                      isComplete
                        ? 'border-done/40 bg-done/10'
                        : isActive
                          ? 'border-accent bg-accent/15'
                          : 'border-border-strong bg-surface'
                    }`}
                  >
                    {isComplete ? (
                      <svg className="h-3.5 w-3.5 text-done" viewBox="0 0 16 16" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <span
                        className={`font-mono text-xs font-bold ${
                          isActive ? 'text-accent' : 'text-text-muted'
                        }`}
                      >
                        {String(stepNum).padStart(2, '0')}
                      </span>
                    )}
                  </motion.div>

                  {/* Labels */}
                  <div className="min-w-0">
                    <p
                      className={`text-sm leading-tight transition-colors duration-300 ${
                        isComplete
                          ? 'font-medium text-text-secondary'
                          : isActive
                            ? 'font-semibold text-text-primary'
                            : 'font-medium text-text-muted'
                      }`}
                    >
                      {step.label}
                    </p>
                    <p
                      className={`mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors duration-300 ${
                        isActive ? 'text-accent/60' : 'text-text-muted/60'
                      }`}
                    >
                      {step.sub}
                    </p>
                  </div>
                </div>

                {/* Connecting line */}
                {i < STEPS.length - 1 && (
                  <div className="ml-[15px] h-12 w-px">
                    <motion.div
                      className="w-full rounded-full"
                      animate={{
                        height: '100%',
                        backgroundColor: isComplete
                          ? 'var(--color-done)'
                          : isActive
                            ? 'var(--color-accent)'
                            : 'var(--color-border-strong)',
                        opacity: isComplete ? 0.4 : isActive ? 0.3 : 0.5,
                      }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      style={{ height: '100%' }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Mobile: horizontal step bar */}
      <div className="fixed inset-x-0 top-[var(--topbar-h)] z-40 flex items-center justify-center gap-3 sm:gap-6 overflow-x-auto border-b border-border bg-surface/80 px-4 py-2.5 backdrop-blur-md lg:hidden">
        {STEPS.map((step, i) => {
          const stepNum = i + 1;
          const isComplete = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={step.label} className="flex items-center gap-2">
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                  isComplete
                    ? 'border-done/40 bg-done/10'
                    : isActive
                      ? 'border-accent bg-accent/15'
                      : 'border-border-strong bg-surface'
                }`}
              >
                {isComplete ? (
                  <svg className="h-2.5 w-2.5 text-done" viewBox="0 0 16 16" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span
                    className={`font-mono text-[10px] font-bold ${
                      isActive ? 'text-accent' : 'text-text-muted'
                    }`}
                  >
                    {stepNum}
                  </span>
                )}
              </div>
              <span
                className={`text-xs ${
                  isComplete
                    ? 'text-text-secondary'
                    : isActive
                      ? 'font-medium text-text-primary'
                      : 'text-text-muted'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default CreationTimeline;
