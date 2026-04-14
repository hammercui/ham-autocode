import type { TaskState } from '../types.js';
import { readInsights } from '../learning/analyzer.js';

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
 * 如果有历史数据（learning insights），使用实际值修正。
 * 否则用 complexityScore 启发式。
 */
export function estimatePERT(tasks: TaskState[], projectDir?: string): PERTEstimate[] {
  // 尝试读取历史数据修正系数
  let historyMultiplier = 1.0;
  if (projectDir) {
    const insights = readInsights(projectDir);
    if (insights && insights.taskStats.completed > 5) {
      // 如果历史 success rate 低，可能任务比预期更难
      historyMultiplier = insights.taskStats.successRate > 80 ? 0.8 : 1.2;
    }
  }

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
