'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DecomposeView } from '@/components/decompose/DecomposeView';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/shared/Button';
import { usePhaseGuard } from '@/hooks/usePhaseGuard';

/**
 * Decompose page wrapper — reads projectId from search params and validates phase.
 * @returns The decompose page with projectId passed to DecomposeView.
 */
function DecomposeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { loading, taskCount, error } = usePhaseGuard(projectId, 'decompose');

  if (!projectId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-mono text-sm text-text-muted">No project ID provided.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-text-secondary">{error}</p>
        <Button variant="ghost" onClick={() => router.push('/')}>Go home</Button>
      </div>
    );
  }

  return <DecomposeView projectId={projectId} initialTaskCount={taskCount} />;
}

/**
 * Decompose page — wrapped in Suspense for useSearchParams.
 * @returns The decompose page component.
 */
export default function DecomposePage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>}>
      <DecomposeContent />
    </Suspense>
  );
}
