import { getTeamColor } from '@/lib/ui/team-color';

interface TeamChipProps {
  /** Team identity — id drives the deterministic colour, name is the label. */
  team: { id: string; name: string };
  /** Visual size — `xs` matches card meta rows, `sm` matches list rows. */
  size?: 'xs' | 'sm';
  /** Hide the leading dot — used when the chip itself is colour-coded enough. */
  showDot?: boolean;
  /** Extra Tailwind classes appended after the colour set. */
  className?: string;
}

const SIZE_CLASSES = {
  xs: 'rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium',
  sm: 'rounded-md px-2 py-0.5 text-xs font-medium tracking-wide',
} as const;

const DOT_CLASSES = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
} as const;

/**
 * Compact label identifying which team a project (or other resource) belongs
 * to. Colour is deterministic per `team.id` so the same team renders with
 * the same hue everywhere it appears (cards, filter pills, group headers,
 * picker rows).
 *
 * @param props - Chip configuration.
 * @returns A small inline-flex chip with a coloured dot and the team name.
 */
export function TeamChip({ team, size = 'xs', showDot = true, className = '' }: TeamChipProps) {
  const color = getTeamColor(team.id);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 ${SIZE_CLASSES[size]} ${color.bg} ${color.text} ${className}`.trim()}
      title={team.name}
    >
      {showDot ? (
        <span className={`shrink-0 rounded-full ${DOT_CLASSES[size]} ${color.dot}`} aria-hidden="true" />
      ) : null}
      <span className="truncate">{team.name}</span>
    </span>
  );
}

export default TeamChip;
