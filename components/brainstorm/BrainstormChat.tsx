'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UIMessage } from 'ai';
import { TopBar } from '@/components/layout/TopBar';
import { PageShell } from '@/components/layout/PageShell';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { IdeaInput } from './IdeaInput';
import { ConversationView } from './ConversationView';
import { createProject } from '@/lib/graph/mutations';
import { convertPersistedToUIMessages } from '@/lib/chat-helpers';
import { usePhaseGuard } from '@/hooks/usePhaseGuard';
import type { Message } from '@/lib/types';

/**
 * Brainstorm page client component. Reads projectId from URL params
 * to survive page refresh. Creates a project in DB on idea submission.
 * @returns The brainstorm flow UI.
 */
export function BrainstormChat() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get('projectId');
  const { loading: guardLoading } = usePhaseGuard(projectIdParam, 'brainstorm');

  const [idea, setIdea] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(projectIdParam);
  const [recoveredMessages, setRecoveredMessages] = useState<UIMessage[] | null>(null);
  const [loading, setLoading] = useState(!!projectIdParam);

  // Recover project + conversation from DB when projectId is in URL
  useEffect(() => {
    if (!projectIdParam) return;

    async function recover() {
      try {
        const [graphRes, convoRes] = await Promise.all([
          fetch(`/api/project/${projectIdParam}/graph`),
          fetch(`/api/project/${projectIdParam}/conversations`),
        ]);

        if (graphRes.ok) {
          const graph = await graphRes.json();
          setIdea(graph.description || 'Recovered project');
          setProjectId(projectIdParam);
        }

        if (convoRes.ok) {
          const { messages } = await convoRes.json() as { messages: Message[] };
          if (messages?.length) {
            setRecoveredMessages(convertPersistedToUIMessages(messages));
          } else {
            setRecoveredMessages([]);
          }
        } else {
          setRecoveredMessages([]);
        }
      } catch (err) {
        console.warn("[brainstorm] conversation recovery failed:", err);
        setRecoveredMessages([]);
      } finally {
        setLoading(false);
      }
    }

    recover();
  }, [projectIdParam]);

  const handleSubmit = useCallback(async (text: string) => {
    const project = await createProject({
      title: 'New Project',
      description: text,
      status: 'brainstorming',
    });
    // Put projectId in URL so it survives refresh
    router.replace(`/new/brainstorm?projectId=${project.id}`);
    setProjectId(project.id);
    setIdea(text);
  }, [router]);

  // Loading state while recovering from URL or validating phase
  if (loading || guardLoading) {
    return (
      <>
        <TopBar stageLabel="Brainstorm" />
        <PageShell>
          <div className="flex min-h-[60vh] items-center justify-center">
            <LoadingSpinner />
          </div>
        </PageShell>
      </>
    );
  }

  // No project yet — show idea input
  if (!idea || !projectId) {
    return (
      <>
        <TopBar />
        <PageShell>
          <IdeaInput onSubmit={handleSubmit} />
        </PageShell>
      </>
    );
  }

  return (
    <>
      <TopBar stageLabel="Brainstorm" />
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-text-primary mb-1">Brainstorm</h1>
          <p className="text-sm text-text-muted truncate max-w-[500px]">{idea.slice(0, 120)}</p>
        </div>

        <ConversationView
          initialIdea={idea}
          projectId={projectId}
          initialMessages={recoveredMessages ?? undefined}
          onStartOver={() => {
            router.replace('/new/brainstorm');
            setIdea(null);
            setProjectId(null);
            setRecoveredMessages(null);
          }}
        />
      </PageShell>
    </>
  );
}
