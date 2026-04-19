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
import { dedupedFetch } from '@/lib/fetch-dedupe';
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

    let cancelled = false;
    async function recover() {
      try {
        const [graph, convoMessages] = await Promise.all([
          dedupedFetch<{ description?: string } | null>(`graph:${projectIdParam}`, () =>
            fetch(`/api/project/${projectIdParam}/graph`).then((r) => (r.ok ? r.json() : null)),
          ),
          dedupedFetch<Message[] | null>(`project-history:${projectIdParam}`, () =>
            fetch(`/api/project/${projectIdParam}/conversations`).then((r) =>
              r.ok ? r.json().then((d: { messages: Message[] }) => d.messages ?? []) : null,
            ),
          ),
        ]);
        if (cancelled) return;

        if (graph) {
          setIdea(graph.description || 'Recovered project');
          setProjectId(projectIdParam);
        }

        setRecoveredMessages(convoMessages && convoMessages.length ? convertPersistedToUIMessages(convoMessages) : []);
      } catch (err) {
        if (!cancelled) {
          console.warn("[brainstorm] conversation recovery failed:", err);
          setRecoveredMessages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    recover();
    return () => { cancelled = true; };
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
