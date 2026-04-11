// core/recovery/checkpoint.js
'use strict';
const git = require('../utils/git');

const TAG_PREFIX = 'ham-checkpoint/';

/**
 * Git tag-based checkpoint: create, rollback, cleanup.
 * Uses lightweight tags with a prefix to namespace checkpoints.
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

/** Rollback to a checkpoint by restoring files from the tag */
function rollbackToCheckpoint(ref, cwd) {
  // First verify the tag exists
  const verify = git.log(1, cwd); // just to verify we're in a git repo
  if (!verify.ok) return { ok: false, error: 'Not a git repository' };

  // Hard reset to checkpoint (restores working tree)
  const result = require('child_process').execSync
    ? (() => {
        try {
          require('child_process').execSync(`git checkout "${ref}" -- .`, { cwd, encoding: 'utf8', timeout: 30000 });
          return { ok: true, output: '' };
        } catch (e) {
          return { ok: false, output: e.stderr || e.message };
        }
      })()
    : { ok: false, output: 'execSync not available' };

  if (!result.ok) {
    return { ok: false, error: `Rollback failed: ${result.output}` };
  }
  return { ok: true, error: null };
}

/** List all checkpoint tags */
function listCheckpoints(cwd) {
  const { execSync } = require('child_process');
  try {
    const output = execSync(`git tag -l "${TAG_PREFIX}*"`, { cwd, encoding: 'utf8', timeout: 10000 }).trim();
    return output ? output.split('\n') : [];
  } catch {
    return [];
  }
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
