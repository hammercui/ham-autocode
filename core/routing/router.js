// core/routing/router.js
'use strict';
const { scoreTask } = require('./scorer');
const { loadConfig } = require('../state/config');
const { writeTask } = require('../state/task-graph');

/**
 * Route a task to the appropriate executor based on scoring rules.
 *
 * Rules (from design):
 * - specScore >= codexMinSpecScore AND isolationScore >= codexMinIsolationScore → codex
 * - task type in [doc, config, hotfix] → claude-app
 * - Otherwise → claude-code (default)
 * - If complexityScore >= confirmThreshold → needsConfirmation = true
 */
function inferTaskType(task) {
  if (task.type) return task.type;

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

function routeTask(task, allTasks, projectDir) {
  const config = loadConfig(projectDir || '.').routing;
  const scores = scoreTask(task, allTasks);
  const taskType = inferTaskType(task);

  let target = config.defaultTarget || 'claude-code';
  let reason = 'default';
  let needsConfirmation = false;

  // Rule 1: High spec + high isolation → codex
  if (scores.specScore >= config.codexMinSpecScore &&
      scores.isolationScore >= config.codexMinIsolationScore) {
    target = 'codex';
    reason = `specScore(${scores.specScore}) >= ${config.codexMinSpecScore} AND isolationScore(${scores.isolationScore}) >= ${config.codexMinIsolationScore}`;
  }
  else if (['doc', 'config', 'hotfix'].includes(taskType)) {
    target = 'claude-app';
    reason = `task type ${taskType} routes to claude-app`;
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
  return tasks.map(task => {
    const routedTask = {
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

module.exports = { routeTask, routeAllTasks };
