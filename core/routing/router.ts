/**
 * v4.2 Router — 6 条规则决策链（R1-R6）。
 *
 * R1  isolation ≥ 80 AND complexity ≤ 50   → codexfake   (独立中等 → gpt-5.4-mini)
 * R2  complexity ≤ 40                      → random(opencode, cc-haiku) + A/B log
 * R3  complexity ≤ 60 AND isolation ≥ 60   → codexfake
 * R4  complexity ≤ 75                      → cc-sonnet
 * R5  (批量级，由 shouldUseAgentTeams 处理)
 * R6  default                              → claude-code (Opus 兜底)
 *
 * 不再把 doc/config/hotfix 路由到 claude-app — claude-app 现为发起者角色，仅通过
 * --agent claude-app 手工指派。
 */

import { scoreTask } from './scorer.js';
import { loadConfig } from '../state/config.js';
import { writeTask } from '../state/task-graph.js';
import { resolveTarget } from './quota.js';
import { pickRandomSimple } from './ab-log.js';
import type { TaskState, TaskScores, RoutingDecision, RoutingTarget, HarnessConfig } from '../types.js';

interface RouteResult extends RoutingDecision {
  confirmed: boolean;
}

export function routeTask(task: TaskState & { type?: string }, allTasks: TaskState[], projectDir?: string): RouteResult {
  const config = loadConfig(projectDir || '.').routing;
  const scores: TaskScores = scoreTask(task, allTasks);
  const files = (task.files || []).length;

  let target: RoutingTarget;
  let reason: string;
  let needsConfirmation = false;

  // R1: 独立中等 → codexfake
  if (scores.isolationScore >= 80 && scores.complexityScore <= 50) {
    target = 'codexfake';
    reason = `R1 isolation≥80 & complexity≤50 → codexfake (gpt-5.4-mini)`;
  }
  // R2: 简单 → random(opencode, cc-haiku)
  else if (scores.complexityScore <= 40) {
    const bucket = projectDir
      ? pickRandomSimple(projectDir, task.id, scores.complexityScore, files)
      : (Math.random() < 0.5 ? 'opencode' : 'cc-haiku') as 'opencode' | 'cc-haiku';
    target = bucket;
    reason = `R2 simple (complexity:${scores.complexityScore}) → random pick ${bucket}`;
  }
  // R3: 中等独立 → codexfake
  else if (scores.complexityScore <= 60 && scores.isolationScore >= 60) {
    target = 'codexfake';
    reason = `R3 complexity≤60 & isolation≥60 → codexfake (gpt-5.4-mini)`;
  }
  // R4: 中复杂 → cc-sonnet
  else if (scores.complexityScore <= 75) {
    target = 'cc-sonnet';
    reason = `R4 complexity≤75 → cc-sonnet`;
  }
  // R6: 兜底 → claude-code (Opus)
  else {
    target = 'claude-code';
    reason = `R6 default high-complexity (${scores.complexityScore}) → claude-code (Opus)`;
  }

  // Quota-aware fallback (保留接口)
  if (projectDir) {
    const resolved = resolveTarget(projectDir, target);
    if (resolved.fallbackApplied) {
      reason += ` [FALLBACK: ${resolved.reason}]`;
      target = resolved.target;
    }
  }

  if (scores.complexityScore >= config.confirmThreshold) {
    needsConfirmation = true;
  }

  return { target, reason, needsConfirmation, confirmed: false, scores };
}

/** R5: Determine whether a wave of tasks should use Agent Teams mode */
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
