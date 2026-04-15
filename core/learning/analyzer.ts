import fs from 'fs';
import path from 'path';
import { readAllTasks } from '../state/task-graph.js';
import { queryTrace } from '../trace/logger.js';
import { ContextBudget } from '../context/budget.js';
import { loadConfig } from '../state/config.js';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';
import type { RoutingTarget } from '../types.js';

export interface RoutingStats {
  routed: number;
  succeeded: number;
  rate: number;
}

export interface FailurePattern {
  errorType: string;
  count: number;
  avgComplexityScore: number;
}

export interface LearningInsights {
  schemaVersion: number;
  analyzedAt: string;
  sessionCount: number;
  taskStats: {
    total: number;
    completed: number;
    failed: number;
    successRate: number;
  };
  routingAccuracy: Record<string, RoutingStats>;
  failurePatterns: FailurePattern[];
  tokenCosts: {
    avgPerTask: number;
    avgPerCommand: number;
    totalConsumed: number;
  };
  thresholdSuggestions: {
    codexMinSpecScore?: number;
    codexMinIsolationScore?: number;
    confirmThreshold?: number;
    highRiskThreshold?: number;
  };
}

function insightsPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'learning', 'insights.json');
}

export function readInsights(projectDir: string): LearningInsights | null {
  const { data } = readJSON<LearningInsights>(insightsPath(projectDir));
  return data;
}

export function analyzeHistory(projectDir: string): LearningInsights {
  const tasks = readAllTasks(projectDir);
  const traces = queryTrace(projectDir, { limit: 10000 });
  const config = loadConfig(projectDir);

  // Task stats
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'done').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const successRate = total > 0 ? Math.round(completed / total * 100) : 0;

  // Routing accuracy: group tasks by routing target, check success rate
  const routingAccuracy: Record<string, RoutingStats> = {};
  for (const target of ['codexfake', 'claude-code', 'claude-app', 'agent-teams'] as RoutingTarget[]) {
    const routed = tasks.filter(t => t.routing?.target === target);
    const succeeded = routed.filter(t => t.status === 'done');
    routingAccuracy[target] = {
      routed: routed.length,
      succeeded: succeeded.length,
      rate: routed.length > 0 ? Math.round(succeeded.length / routed.length * 100) : 0,
    };
  }

  // Failure patterns: group failed tasks by error type
  const errorMap = new Map<string, { count: number; complexitySum: number }>();
  for (const task of tasks.filter(t => t.status === 'failed')) {
    const errorType = task.execution?.errorType || 'unknown';
    const existing = errorMap.get(errorType) || { count: 0, complexitySum: 0 };
    existing.count++;
    existing.complexitySum += task.scores?.complexityScore || 0;
    errorMap.set(errorType, existing);
  }
  const failurePatterns: FailurePattern[] = [...errorMap.entries()]
    .map(([errorType, data]) => ({
      errorType,
      count: data.count,
      avgComplexityScore: data.count > 0 ? Math.round(data.complexitySum / data.count) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Token costs
  const budget = new ContextBudget(projectDir);
  const budgetStatus = budget.status();
  const totalConsumed = budgetStatus.consumed;
  const commandCount = traces.length;

  // Threshold suggestions based on routing accuracy
  const suggestions: LearningInsights['thresholdSuggestions'] = {};

  const codexStats = routingAccuracy['codexfake'];
  if (codexStats && codexStats.routed >= 3) {
    if (codexStats.rate > 90) {
      // Codex is very reliable -> can lower the bar
      suggestions.codexMinSpecScore = Math.max(60, (config.routing.codexMinSpecScore || 80) - 5);
    } else if (codexStats.rate < 70) {
      // Codex failing too much -> raise the bar
      suggestions.codexMinSpecScore = Math.min(95, (config.routing.codexMinSpecScore || 80) + 5);
    }
  }

  // Check if high-complexity tasks (70-90) rarely fail -> can raise threshold
  const midComplexTasks = tasks.filter(t => {
    const cx = t.scores?.complexityScore || 0;
    return cx >= 70 && cx <= 90;
  });
  if (midComplexTasks.length >= 3) {
    const midFailed = midComplexTasks.filter(t => t.status === 'failed').length;
    const midFailRate = midFailed / midComplexTasks.length;
    if (midFailRate < 0.1) {
      suggestions.highRiskThreshold = Math.min(90, (config.recovery.highRiskThreshold || 70) + 10);
    } else if (midFailRate > 0.3) {
      suggestions.highRiskThreshold = Math.max(50, (config.recovery.highRiskThreshold || 70) - 10);
    }
  }

  // Count sessions from trace (group by gaps > 5 minutes)
  let sessionCount = traces.length > 0 ? 1 : 0;
  for (let i = 1; i < traces.length; i++) {
    const prev = new Date(traces[i - 1].time).getTime();
    const curr = new Date(traces[i].time).getTime();
    if (curr - prev > 5 * 60 * 1000) sessionCount++;
  }

  const insights: LearningInsights = {
    schemaVersion: 1,
    analyzedAt: new Date().toISOString(),
    sessionCount,
    taskStats: { total, completed, failed, successRate },
    routingAccuracy,
    failurePatterns,
    tokenCosts: {
      avgPerTask: completed > 0 ? Math.round(totalConsumed / completed) : 0,
      avgPerCommand: commandCount > 0 ? Math.round(totalConsumed / commandCount) : 0,
      totalConsumed,
    },
    thresholdSuggestions: suggestions,
  };

  // Persist
  const dir = path.dirname(insightsPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteJSON(insightsPath(projectDir), insights);

  return insights;
}
