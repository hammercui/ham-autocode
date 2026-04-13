import path from 'path';
import { readPipeline } from '../state/pipeline.js';
import { readAllTasks } from '../state/task-graph.js';
import { queryTrace } from './logger.js';
import { readJSON } from '../state/atomic.js';

export interface SessionReport {
  project: string;
  duration: string;
  tasksCompleted: number;
  tasksFailed: number;
  tasksRemaining: number;
  totalCommands: number;
  totalTokensConsumed: number;
  topErrors: { error: string; count: number }[];
}

interface BudgetState {
  consumed: number;
}

export function generateSessionReport(projectDir: string): SessionReport {
  // Read pipeline
  const pipeline = readPipeline(projectDir);
  const project = pipeline?.project ?? path.basename(projectDir);

  // Calculate duration
  let duration = 'unknown';
  if (pipeline?.started_at) {
    const start = new Date(pipeline.started_at).getTime();
    const end = Date.now();
    const diffMs = end - start;
    const hours = Math.floor(diffMs / 3_600_000);
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
    const seconds = Math.floor((diffMs % 60_000) / 1000);
    duration = `${hours}h ${minutes}m ${seconds}s`;
  }

  // Read tasks
  const tasks = readAllTasks(projectDir);
  const tasksCompleted = tasks.filter(t => t.status === 'done').length;
  const tasksFailed = tasks.filter(t => t.status === 'failed').length;
  const tasksRemaining = tasks.filter(t =>
    t.status !== 'done' && t.status !== 'failed' && t.status !== 'skipped',
  ).length;

  // Read trace (no limit — get all)
  const entries = queryTrace(projectDir, { limit: 999999 });
  const totalCommands = entries.length;

  // Read budget
  const budgetPath = path.join(projectDir, '.ham-autocode', 'context', 'budget.json');
  const { data: budgetData } = readJSON<BudgetState>(budgetPath);
  const totalTokensConsumed = budgetData?.consumed ?? 0;

  // Aggregate top errors
  const errorMap = new Map<string, number>();
  for (const e of entries) {
    if (e.result === 'error' && e.error) {
      const key = e.error;
      errorMap.set(key, (errorMap.get(key) ?? 0) + 1);
    }
  }
  const topErrors = [...errorMap.entries()]
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    project,
    duration,
    tasksCompleted,
    tasksFailed,
    tasksRemaining,
    totalCommands,
    totalTokensConsumed,
    topErrors,
  };
}
