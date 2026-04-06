import { Suspense } from 'react';
import { BrainstormChat } from '@/components/brainstorm/BrainstormChat';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

/**
 * Brainstorm page — wrapped in Suspense for useSearchParams.
 * @returns The brainstorm page component.
 */
export default function BrainstormPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>}>
      <BrainstormChat />
    </Suspense>
  );
}
