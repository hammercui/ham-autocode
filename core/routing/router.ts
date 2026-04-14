/**
 * Route a task to the appropriate executor based on scoring rules.
 *
 * Rules (from design):
 * - specScore >= codexMinSpecScore AND isolationScore >= codexMinIsolationScore -> codex
 * - task type in [doc, config, hotfix] -> claude-app
 * - Otherwise -> claude-code (default)
 * - If complexityScore >= confirmThreshold -> needsConfirmation = true
 */

import { scoreTask } from './scorer.js';
import { loadConfig } from '../state/config.js';
import { writeTask } from '../state/task-graph.js';
import { readInsights } from '../learning/analyzer.js';
import type { TaskState, TaskScores, RoutingDecision, RoutingTarget, HarnessConfig, RoutingConfig } from '../types.js';

type TaskType = 'doc' | 'config' | 'hotfix' | 'default';

interface RouteResult extends RoutingDecision {
  confirmed: boolean;
}

function inferTaskType(task: TaskState & { type?: string }): TaskType {
  if (task.type) return task.type as TaskType;

  const haystack = [
    task.phase,
    task.name,
    task.spec?.description,
    ...(task.files || []),
  ].filter(Boolean).join(' ').toLowerCase();

  if (/\b(doc|docs|readme)\b/.test(haystack)) return 'doc';
  if (/\b(config|settings|json|ya?ml|toml|ini|env)\b/.test(haystack)) return 'config';
  if (/\b(hotfix|patch|urgent|incident)\b/.test(haystack)) return 'hotfix';
  return 'default';
}

export function routeTask(task: TaskState & { type?: string }, allTasks: TaskState[], projectDir?: string): RouteResult {
  const baseConfig = loadConfig(projectDir || '.').routing;

  // v3.0 CE: check learning insights for adapted thresholds
  const insights = readInsights(projectDir || '.');
  const config: RoutingConfig = insights?.thresholdSuggestions
    ? {
        ...baseConfig,
        codexMinSpecScore: insights.thresholdSuggestions.codexMinSpecScore ?? baseConfig.codexMinSpecScore,
        codexMinIsolationScore: insights.thresholdSuggestions.codexMinIsolationScore ?? baseConfig.codexMinIsolationScore,
        confirmThreshold: insights.thresholdSuggestions.confirmThreshold ?? baseConfig.confirmThreshold,
      }
    : baseConfig;
  const scores: TaskScores = scoreTask(task, allTasks);
  const taskType = inferTaskType(task);

  let target: RoutingTarget = config.defaultTarget || 'claude-code';
  let reason = 'default';
  let needsConfirmation = false;

  // Rule 0: Very simple tasks → opencode (free model)
  if (scores.complexityScore <= 20 && (task.files || []).length <= 3 &&
      !(scores.specScore >= config.codexMinSpecScore && scores.isolationScore >= config.codexMinIsolationScore)) {
    target = 'opencode';
    reason = `simple task (complexity:${scores.complexityScore}, files:${(task.files || []).length}) → free model`;
  }
  // Rule 1: High spec + high isolation -> codex
  else if (scores.specScore >= config.codexMinSpecScore &&
      scores.isolationScore >= config.codexMinIsolationScore) {
    target = 'codex';
    reason = `specScore(${scores.specScore}) >= ${config.codexMinSpecScore} AND isolationScore(${scores.isolationScore}) >= ${config.codexMinIsolationScore}`;
  }
  else if (['doc', 'config', 'hotfix'].includes(taskType)) {
    target = 'claude-app';
    reason = `task type ${taskType} routes to claude-app`;
  }
  // Rule 3: Default -> claude-code
  else {
    reason = `default routing (spec:${scores.specScore} complexity:${scores.complexityScore} isolation:${scores.isolationScore})`;
  }

  // Confirmation gate
  if (scores.complexityScore >= config.confirmThreshold) {
    needsConfirmation = true;
  }

  return {
    target,
    reason,
    needsConfirmation,
    confirmed: false,
    scores,
  };
}

/** Determine whether a wave of tasks should use Agent Teams mode (AT1) */
export function shouldUseAgentTeams(wave: TaskState[], config: HarnessConfig): boolean {
  if (wave.length < 3) return false;
  return wave.every(t => (t.scores?.isolationScore || 0) >= (config.routing?.codexMinIsolationScore || 70));
}

/** Route all tasks in a list */
export function routeAllTasks(tasks: TaskState[], projectDir?: string): TaskState[] {
  return tasks.map(task => {
    const routedTask: TaskState = {
      ...task,
      scores: scoreTask(task, tasks),
      routing: routeTask(task, tasks, projectDir),
    };

    if (projectDir) {
      writeTask(projectDir, routedTask);
    }

    return routedTask;
  });
}
