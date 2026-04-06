'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { updateProjectStatus } from '@/lib/actions/project';
import { Button } from '@/components/shared/Button';

interface ReviewActionsProps {
  /** @param projectId - UUID of the project to activate. */
  projectId: string;
}

/**
 * Client component with navigation buttons for the review page.
 * "Enter project" sets status to active and redirects to workspace.
 * @param props - Review actions configuration.
 * @returns Navigation action buttons.
 */
export function ReviewActions({ projectId }: ReviewActionsProps) {
  const router = useRouter();

  const handleEnter = useCallback(async () => {
    await updateProjectStatus(projectId, 'active');
    router.push(`/project/${projectId}`);
  }, [projectId, router]);

  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        onClick={() => router.push(`/new/decompose?projectId=${projectId}`)}
      >
        &larr; Adjust structure
      </Button>
      <Button variant="primary" onClick={handleEnter}>
        Enter project &rarr;
      </Button>
    </div>
  );
}

export default ReviewActions;
