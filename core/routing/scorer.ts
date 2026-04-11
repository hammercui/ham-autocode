/**
 * Score a task across 3 dimensions for routing decisions.
 * specScore (0-100): How complete is the task specification
 * complexityScore (0-100): How complex is the task
 * isolationScore (0-100): How isolated is the task from others
 */

import type { TaskState, TaskScores } from '../types.js';

/** Score spec completeness (0-100) */
export function scoreSpec(task: TaskState): number {
  if (!task.spec) return 0;
  let score = task.spec.completeness || 0;
  if (score > 0) return Math.min(100, score);

  // Heuristic: check spec fields
  if (task.spec.description) score += 30;
  if (task.spec.interface) score += 30;
  if (task.spec.acceptance) score += 40;
  return Math.min(100, score);
}

/** Score complexity (0-100, higher = more complex) */
export function scoreComplexity(task: TaskState): number {
  const fileWeight = (task.files || []).length * 20;
  const depWeight = (task.blockedBy || []).length * 15;
  return Math.min(100, fileWeight + depWeight);
}

/** Score isolation (0-100, higher = more isolated) */
export function scoreIsolation(task: TaskState, allTasks: TaskState[]): number {
  if (!allTasks || allTasks.length <= 1) return 100;

  const taskFiles = new Set(task.files || []);
  if (taskFiles.size === 0) return 100;

  let overlapCount = 0;
  for (const other of allTasks) {
    if (other.id === task.id) continue;
    const otherFiles = other.files || [];
    for (const f of otherFiles) {
      if (taskFiles.has(f)) {
        overlapCount++;
        break;
      }
    }
  }

  // More overlapping tasks = less isolated
  const overlapRatio = overlapCount / (allTasks.length - 1);
  return Math.round((1 - overlapRatio) * 100);
}

/** Compute all 3 scores for a task */
export function scoreTask(task: TaskState, allTasks: TaskState[]): TaskScores {
  return {
    specScore: scoreSpec(task),
    complexityScore: scoreComplexity(task),
    isolationScore: scoreIsolation(task, allTasks),
  };
}
