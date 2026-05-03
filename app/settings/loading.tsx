import { TopBar } from '@/components/layout/TopBar';
import { PageShell } from '@/components/layout/PageShell';

/**
 * Loading skeleton for the settings page. Mirrors the header + tab strip
 * shape so the layout doesn't shift when content arrives.
 *
 * @returns Server-rendered skeleton.
 */
export default function SettingsLoading() {
  return (
    <>
      <TopBar />
      <PageShell>
        <header className="mb-8">
          <div className="mb-1 h-8 w-32 animate-pulse rounded-md bg-surface-raised" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-surface-raised" />
        </header>
        <div className="mb-6 h-10 w-full max-w-md animate-pulse rounded-lg bg-surface-raised/60" />
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-xl bg-surface-raised/60" />
          <div className="h-24 animate-pulse rounded-xl bg-surface-raised/60" />
        </div>
      </PageShell>
    </>
  );
}
