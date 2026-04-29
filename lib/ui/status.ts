/**
 * Map task status to chip classes (background + text).
 * @param status - Task status string.
 * @returns Tailwind classes for a status chip.
 */
export function statusChip(status: string): string {
  switch (status) {
    case 'done': return 'bg-done/10 text-done';
    case 'in_progress': return 'bg-progress/10 text-progress';
    case 'planned': return 'bg-planned/10 text-planned';
    case 'cancelled': return 'bg-cancelled/10 text-cancelled line-through';
    default: return 'bg-draft/10 text-draft';
  }
}

/**
 * Map task status to chip text color only.
 * @param status - Task status string.
 * @returns Tailwind text color class.
 */
export function statusChipText(status: string): string {
  switch (status) {
    case 'done': return 'text-done';
    case 'in_progress': return 'text-progress';
    case 'planned': return 'text-planned';
    case 'cancelled': return 'text-cancelled line-through';
    default: return 'text-draft';
  }
}

/**
 * Map task status to dot color class.
 * @param status - Task status string.
 * @returns Tailwind background class for a status dot.
 */
export function statusDot(status: string): string {
  switch (status) {
    case 'done': return 'bg-done';
    case 'in_progress': return 'bg-progress';
    case 'planned': return 'bg-planned';
    case 'cancelled': return 'bg-cancelled';
    default: return 'bg-draft';
  }
}

/**
 * Map task status to short display label.
 * @param status - Task status string.
 * @returns Short label string.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case 'done': return 'Done';
    case 'planned': return 'Planned';
    case 'in_progress': return 'In Progress';
    case 'cancelled': return 'Cancelled';
    default: return 'Draft';
  }
}
