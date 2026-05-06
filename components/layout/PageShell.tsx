'use client';

import { type ReactNode } from 'react';

interface PageShellProps {
  /** @param children - Page content. */
  children: ReactNode;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Centered page container that fills the AppShell main column. TopBar is
 * now in flow at the top of the column so no top offset is required.
 * @param props - Page shell configuration.
 * @returns A scrollable content container element with a centered max-width inner.
 */
export function PageShell({ children, className = '' }: PageShellProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className={`mx-auto max-w-3xl px-4 pb-12 pt-6 sm:px-6 lg:max-w-4xl lg:px-8 xl:max-w-5xl ${className}`}>
        {children}
      </div>
    </div>
  );
}

export default PageShell;
