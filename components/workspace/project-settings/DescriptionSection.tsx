'use client';

import { useCallback, useState } from 'react';
import { updateProjectSettings } from '@/lib/actions/project';

interface DescriptionSectionProps {
  projectId: string;
  initialDescription: string;
  onUpdated?: () => void;
}

const SECTION_LABEL_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted';

/**
 * Click-to-edit textarea (3 rows) that persists on blur.
 * @param props - Section props.
 * @returns Description row.
 */
export function DescriptionSection({ projectId, initialDescription, onUpdated }: DescriptionSectionProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialDescription);
  const [syncedInitialDescription, setSyncedInitialDescription] = useState(initialDescription);
  const [serverError, setServerError] = useState<string | null>(null);

  if (initialDescription !== syncedInitialDescription && !editing) {
    setSyncedInitialDescription(initialDescription);
    setValue(initialDescription);
  }

  /**
   * Persist the trimmed description if it changed.
   * @returns Resolves once the server action completes.
   */
  const commit = useCallback(async () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed !== value) setValue(trimmed);
    if (trimmed === initialDescription) { setServerError(null); return; }
    setServerError(null);
    const result = await updateProjectSettings(projectId, { description: trimmed });
    if (!result.ok) { setServerError(result.message); return; }
    onUpdated?.();
  }, [value, initialDescription, projectId, onUpdated]);

  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Description</label>
      {editing ? (
        <textarea
          value={value}
          rows={3}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setValue(initialDescription); setServerError(null); setEditing(false); }
          }}
          autoFocus
          className="w-full resize-none rounded-lg border border-border-strong bg-base px-3 py-2 text-sm text-text-secondary outline-none transition-colors focus:border-accent"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full cursor-pointer rounded-lg border border-transparent px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:border-border hover:bg-surface-hover/40"
        >
          {value || <span className="text-text-muted">Add a description…</span>}
        </button>
      )}
      {serverError && (
        <p className="font-mono text-[10px] text-danger">{serverError}</p>
      )}
    </section>
  );
}
