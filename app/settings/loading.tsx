/**
 * Loading skeleton for the settings sub-shell. Mirrors the rail-plus-content
 * layout (240px left rail with five row skeletons + a content column with a
 * header and two card placeholders) so the page settles smoothly when the
 * fully-rendered tree mounts.
 *
 * @returns Server-rendered skeleton.
 */
export default function SettingsLoading() {
  return (
    <div className="flex h-[var(--viewport-height)] flex-col">
      <div
        className="flex flex-shrink-0 items-center border-b border-border bg-base/80 px-3 backdrop-blur-md"
        style={{ height: 'var(--topbar-h)' }}
      >
        <div className="h-4 w-32 animate-pulse rounded bg-surface-raised" />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border px-3 py-5 md:flex"
          style={{ background: 'var(--color-base-2)' }}
          aria-hidden="true"
        >
          <div className="mb-2 ml-2 h-3 w-16 animate-pulse rounded bg-surface-raised/60" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-full animate-pulse rounded-md bg-surface-raised/50"
            />
          ))}
        </aside>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[720px] px-6 py-8 sm:px-10">
            <div className="mb-6">
              <div className="mb-2 h-7 w-40 animate-pulse rounded-md bg-surface-raised" />
              <div className="h-4 w-72 animate-pulse rounded-md bg-surface-raised/60" />
            </div>
            <div className="space-y-4">
              <div className="h-44 animate-pulse rounded-[10px] bg-surface-raised/60" />
              <div className="h-28 animate-pulse rounded-[10px] bg-surface-raised/60" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
