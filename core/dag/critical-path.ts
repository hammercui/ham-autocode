import { topoSort } from './graph.js';
import type { TaskState } from '../types.js';

export interface CPMResult {
  criticalPath: string[];
  criticalPathDuration: number;
  slack: Record<string, number>;
  parallelism: number;
  bottlenecks: string[];
}

/**
 * CPM 关键路径法。
 * 工期估算：complexityScore * 1 分钟（无历史数据时）
 *
 * 1. 正向遍历：计算最早开始(ES)和最早完成(EF)
 * 2. 反向遍历：计算最晚开始(LS)和最晚完成(LF)
 * 3. 浮动时间 = LS - ES
 * 4. 关键路径 = 浮动时间为 0 的任务链
 */
export function analyzeCriticalPath(tasks: TaskState[]): CPMResult {
  if (tasks.length === 0) {
    return { criticalPath: [], criticalPathDuration: 0, slack: {}, parallelism: 1, bottlenecks: [] };
  }

  const { sorted } = topoSort(tasks);
  const duration = new Map<string, number>();
  const es = new Map<string, number>(); // 最早开始
  const ef = new Map<string, number>(); // 最早完成
  const ls = new Map<string, number>(); // 最晚开始
  const lf = new Map<string, number>(); // 最晚完成

  // 初始化工期
  for (const t of tasks) {
    duration.set(t.id, Math.max(1, t.scores?.complexityScore || 10));
  }

  // 正向遍历
  for (const t of sorted) {
    const deps = (t.blockedBy || []).filter(d => es.has(d));
    const start = deps.length > 0 ? Math.max(...deps.map(d => ef.get(d) || 0)) : 0;
    es.set(t.id, start);
    ef.set(t.id, start + (duration.get(t.id) || 1));
  }

  // 项目总工期
  const projectDuration = Math.max(...[...ef.values()], 0);

  // 反向遍历
  for (const t of [...sorted].reverse()) {
    // 找所有依赖此任务的后继
    const successors = tasks.filter(s => (s.blockedBy || []).includes(t.id));
    const finish = successors.length > 0
      ? Math.min(...successors.map(s => ls.get(s.id) ?? projectDuration))
      : projectDuration;
    lf.set(t.id, finish);
    ls.set(t.id, finish - (duration.get(t.id) || 1));
  }

  // 计算浮动时间和关键路径
  const slack: Record<string, number> = {};
  const criticalPath: string[] = [];
  for (const t of sorted) {
    const s = (ls.get(t.id) || 0) - (es.get(t.id) || 0);
    slack[t.id] = Math.max(0, s);
    if (s <= 0) criticalPath.push(t.id);
  }

  // 计算最大并行度（同时可执行的最大任务数）
  // 简化：按 ES 分组，最大组的大小
  const timeSlots = new Map<number, number>();
  for (const t of tasks) {
    const start = es.get(t.id) || 0;
    timeSlots.set(start, (timeSlots.get(start) || 0) + 1);
  }
  const parallelism = Math.max(...timeSlots.values(), 1);

  // 瓶颈：关键路径上且有多个后继的任务
  const bottlenecks = criticalPath.filter(id => {
    const successors = tasks.filter(s => (s.blockedBy || []).includes(id));
    return successors.length >= 2;
  });

  return { criticalPath, criticalPathDuration: projectDuration, slack, parallelism, bottlenecks };
}
