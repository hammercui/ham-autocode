// core/recovery/checkpoint.js
'use strict';
const git = require('../utils/git');

const TAG_PREFIX = 'ham-checkpoint/';

/**
 * Git tag-based checkpoint: create, rollback, cleanup.
 * Uses lightweight tags with a prefix to namespace checkpoints.
 * Git subprocesses use argument arrays in core/utils/git.js to avoid shell
 * interpolation of task-controlled values.
 */

/** Create a checkpoint tag before risky operations */
function createCheckpoint(taskId, cwd) {
  const name = `${TAG_PREFIX}${taskId}-${Date.now()}`;
  const result = git.tag(name, cwd);
  if (!result.ok) {
    return { ok: false, ref: null, error: result.output };
  }
  return { ok: true, ref: name, error: null };
}

/** Rollback to a checkpoint by restoring task-specific files from the tag */
function rollbackToCheckpoint(ref, cwd, files) {
  const verify = git.log(1, cwd);
  if (!verify.ok) return { ok: false, error: 'Not a git repository' };

  // If specific files provided, restore only those; otherwise restore all
  if (files && files.length > 0) {
    const result = git.checkoutFiles(ref, files, cwd);
    if (!result.ok) return { ok: false, error: `Rollback failed: ${result.output}` };
  } else {
    const result = git.checkoutAll(ref, cwd);
    if (!result.ok) return { ok: false, error: `Rollback failed: ${result.output}` };
  }
  return { ok: true, error: null };
}

/** List all checkpoint tags */
function listCheckpoints(cwd) {
  const result = git.listTags(`${TAG_PREFIX}*`, cwd);
  if (!result.ok) {
    return [];
  }
  return result.output ? result.output.split('\n').filter(Boolean) : [];
}

/** Clean up checkpoint tags for a specific task */
function cleanupCheckpoints(taskId, cwd) {
  const prefix = `${TAG_PREFIX}${taskId}-`;
  const tags = listCheckpoints(cwd).filter(t => t.startsWith(prefix));
  const results = [];
  for (const tag of tags) {
    results.push({ tag, ...git.deleteTag(tag, cwd) });
  }
  return results;
}

/** Clean up ALL checkpoint tags */
function cleanupAllCheckpoints(cwd) {
  const tags = listCheckpoints(cwd);
  const results = [];
  for (const tag of tags) {
    results.push({ tag, ...git.deleteTag(tag, cwd) });
  }
  return results;
}

module.exports = { createCheckpoint, rollbackToCheckpoint, listCheckpoints, cleanupCheckpoints, cleanupAllCheckpoints, TAG_PREFIX };
