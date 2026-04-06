'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';
import type { Task } from '@/lib/db/schema';
import { statusChip, statusDot } from '@/lib/ui/status';

interface TaskListProps {
  /** @param tasks - Ordered array of tasks. */
  tasks: Task[];
}

/**
 * Displays the project task breakdown grouped by tags.
 * Animated staggered entrance.
 * @param props - Task list data.
 * @returns A styled list of tasks grouped by tags.
 */
export function TaskList({ tasks }: TaskListProps) {
  const tagGroups = useMemo(() => {
    const groups = new Map<string, Task[]>();
    const ungrouped: Task[] = [];

    for (const task of tasks) {
      if (!task.tags || task.tags.length === 0) {
        ungrouped.push(task);
      } else {
        for (const tag of task.tags) {
          const arr = groups.get(tag) ?? [];
          arr.push(task);
          groups.set(tag, arr);
        }
      }
    }

    const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (ungrouped.length > 0) sorted.push(['Ungrouped', ungrouped]);
    return sorted;
  }, [tasks]);

  return (
    <div className="space-y-4">
      {tagGroups.map(([tag, groupTasks], i) => (
        <motion.div
          key={tag}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1, duration: 0.3 }}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <div className="mb-2 flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 font-mono text-xs font-semibold text-accent">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="text-sm font-semibold text-text-primary">{tag}</h3>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] text-text-muted mb-2">
            <span>{groupTasks.length} tasks</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {groupTasks.map((task) => (
              <span
                key={task.id}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs ${statusChip(task.status)}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot(task.status)}`} />
                {task.title}
              </span>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export default TaskList;
