'use client';

import type { TaskStatus } from '@/lib/types';

/**
 * Optional virtual groups — derived sub-stages, not schema statuses.
 *
 * Consumed by `StructureView` (status grouping + filter chips) and
 * `FilterBar`. The `TaskGroup` *component* that previously wrapped a
 * sticky header + children lives inline in `StructureView`'s
 * virtualised renderer (`TaskGroupHeader`) now.
 */
export type TaskGroupKey = TaskStatus | 'ready' | 'plannable';
