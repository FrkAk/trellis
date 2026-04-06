'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CreationTimeline } from '@/components/layout/CreationTimeline';

/**
 * Shared layout for the project creation flow (/new/*).
 * Renders a persistent vertical timeline sidebar alongside page content.
 * @param props - Layout props with children.
 * @returns Layout with timeline and content area.
 */
export default function NewProjectLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const currentStep: 1 | 2 | 3 = pathname.includes('/decompose')
    ? 2
    : pathname.includes('/review')
      ? 3
      : 1;

  return (
    <div className="flex min-h-screen">
      <CreationTimeline currentStep={currentStep} />
      <div className="flex-1 lg:pl-[220px]">
        {/* Extra top padding on mobile for the horizontal step bar */}
        <div className="pt-10 lg:pt-0">
          {children}
        </div>
      </div>
    </div>
  );
}
