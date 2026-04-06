'use client';

import { type ReactNode } from 'react';

interface PageShellProps {
  /** @param children - Page content. */
  children: ReactNode;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Centered page container with TopBar offset padding.
 * @param props - Page shell configuration.
 * @returns A centered content container element.
 */
export function PageShell({ children, className = '' }: PageShellProps) {
  return (
    <div className={`mx-auto max-w-3xl lg:max-w-4xl xl:max-w-5xl px-4 sm:px-6 lg:px-8 pt-[74px] pb-12 ${className}`}>
      {children}
    </div>
  );
}

export default PageShell;
