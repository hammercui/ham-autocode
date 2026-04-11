// core/dag/scheduler.ts
import type { TaskState, DAGStats } from '../types.js';
import { topoSort } from './graph.js';

const DONE_STATUSES = new Set<string>(['done', 'skipped']);

/** Get next wave of executable tasks (all blockedBy resolved).
 *  Gap A2: calls topoSort to detect cycles and excludes cyclic tasks. */
export function nextWave(tasks: TaskState[]): TaskState[] {
  // Gap A2: detect cycles and exclude cyclic tasks from candidates
  const { cycles } = topoSort(tasks);
  const cycleSet = new Set(cycles);

  const warned = new Set<string>();
  return tasks.filter(t => {
    if (t.status !== 'pending') return false;
    if (cycleSet.has(t.id)) return false;
    if (!t.blockedBy || t.blockedBy.length === 0) return true;
    return t.blockedBy.every(depId => {
      const dep = tasks.find(d => d.id === depId);
      if (!dep) {
        if (!warned.has(depId)) {
          warned.add(depId);
          console.warn(`Warning: missing dependency ${depId} treated as resolved`);
        }
        return true;
      }
      return DONE_STATUSES.has(dep.status);
    });
  });
}

/** Compute DAG statistics. Gap A2: includes cycles field. */
export function dagStats(tasks: TaskState[]): DAGStats & { cycles: string[] } {
  const total = tasks.length;
  const byStatus: Record<string, number> = {};
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }
  const done = (byStatus.done || 0) + (byStatus.skipped || 0);

  // Gap A2: include cycle detection in stats
  const { cycles } = topoSort(tasks);

  return {
    total,
    byStatus,
    done,
    remaining: total - done,
    progress: total > 0 ? Math.round(done / total * 100) : 0,
    cycles,
  };
}
