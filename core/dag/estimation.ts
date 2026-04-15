import type { TaskState } from '../types.js';

export interface PERTEstimate {
  taskId: string;
  taskName: string;
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
  expected: number;
  stdDev: number;
}

/**
 * PERT 三点估算（分钟）。
 * 基于 complexityScore 启发式估算。
 */
export function estimatePERT(tasks: TaskState[], _projectDir?: string): PERTEstimate[] {
  const historyMultiplier = 1.0;

  return tasks.map(t => {
    const cx = Math.max(1, t.scores?.complexityScore || 10);
    const optimistic = Math.round(cx * 0.5 * historyMultiplier);
    const mostLikely = Math.round(cx * 1.0 * historyMultiplier);
    const pessimistic = Math.round(cx * 2.5 * historyMultiplier);
    const expected = Math.round((optimistic + 4 * mostLikely + pessimistic) / 6);
    const stdDev = Math.round((pessimistic - optimistic) / 6);

    return { taskId: t.id, taskName: t.name, optimistic, mostLikely, pessimistic, expected, stdDev };
  });
}
