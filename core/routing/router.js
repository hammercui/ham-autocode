// core/routing/router.js
'use strict';
const { scoreTask } = require('./scorer');
const { loadConfig } = require('../state/config');

/**
 * Route a task to the appropriate executor based on scoring rules.
 *
 * Rules (from design):
 * - specScore >= codexMinSpecScore AND isolationScore >= codexMinIsolationScore → codex
 * - complexityScore < 30 AND specScore >= 60 → claude-app (lightweight)
 * - Otherwise → claude-code (default)
 * - If complexityScore >= confirmThreshold → needsConfirmation = true
 */
function routeTask(task, allTasks, projectDir) {
  const config = loadConfig(projectDir || '.').routing;
  const scores = scoreTask(task, allTasks);

  let target = config.defaultTarget || 'claude-code';
  let reason = 'default';
  let needsConfirmation = false;

  // Rule 1: High spec + high isolation → codex
  if (scores.specScore >= config.codexMinSpecScore &&
      scores.isolationScore >= config.codexMinIsolationScore) {
    target = 'codex';
    reason = `specScore(${scores.specScore}) >= ${config.codexMinSpecScore} AND isolationScore(${scores.isolationScore}) >= ${config.codexMinIsolationScore}`;
  }
  // Rule 2: Low complexity + decent spec → claude-app
  else if (scores.complexityScore < 30 && scores.specScore >= 60) {
    target = 'claude-app';
    reason = `low complexity(${scores.complexityScore}) + adequate spec(${scores.specScore})`;
  }
  // Rule 3: Default → claude-code
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

/** Route all tasks in a list */
function routeAllTasks(tasks, projectDir) {
  return tasks.map(task => ({
    ...task,
    scores: scoreTask(task, tasks),
    routing: routeTask(task, tasks, projectDir),
  }));
}

module.exports = { routeTask, routeAllTasks };
