'use client';

import { TeamChip } from '@/components/shared/TeamChip';

interface TeamSectionProps {
  /** @param team - Team that owns this project. Read-only display. */
  team: { id: string; name: string };
}

const SECTION_LABEL_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted';

/**
 * Read-only owning-team indicator for the project settings modal. Mirrors
 * the team chip used on home-page project cards so the same hue identifies
 * the same team everywhere it surfaces.
 *
 * Project ownership is fixed at creation — there is no team-switch affordance
 * inside this modal. The helper line below the chip makes that explicit.
 *
 * @param props - Section props.
 * @returns Section row with the team chip and a one-line read-only hint.
 */
export function TeamSection({ team }: TeamSectionProps) {
  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Team</label>
      <div className="space-y-1">
        <TeamChip team={team} size="sm" />
        <p className="text-xs text-text-muted">
          Project ownership is set at creation and cannot be changed here.
        </p>
      </div>
    </section>
  );
}
