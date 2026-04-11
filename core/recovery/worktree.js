// core/recovery/worktree.js
'use strict';
const path = require('path');
const git = require('../utils/git');

const WORKTREE_PREFIX = 'ham-wt-';

function getWorktreePath(taskId, cwd) {
  return path.join(cwd, '.ham-autocode', 'worktrees', taskId);
}

/**
 * Git worktree lifecycle: create, merge, remove.
 * Used for high-risk tasks that need isolation.
 */

/** Create an isolated worktree for a task */
function createWorktree(taskId, cwd) {
  const branch = `${WORKTREE_PREFIX}${taskId}`;
  const worktreePath = getWorktreePath(taskId, cwd);

  const result = git.worktreeAdd(worktreePath, branch, cwd);
  if (!result.ok) {
    return { ok: false, path: null, branch: null, error: result.output };
  }
  return { ok: true, path: worktreePath, branch, error: null };
}

/** Merge worktree branch back into current branch */
function mergeWorktree(taskId, cwd) {
  const branch = `${WORKTREE_PREFIX}${taskId}`;
  const result = git.merge(branch, cwd);
  if (!result.ok) {
    return { ok: false, error: result.output, conflicts: result.output.includes('CONFLICT') };
  }
  return { ok: true, error: null, conflicts: false };
}

/** Remove a worktree and its branch */
function removeWorktree(taskId, cwd) {
  const branch = `${WORKTREE_PREFIX}${taskId}`;
  const worktreePath = getWorktreePath(taskId, cwd);

  const removeResult = git.worktreeRemove(worktreePath, cwd);
  const branchResult = git.branchDelete(branch, cwd);
  const errors = [];
  if (!removeResult.ok) errors.push(removeResult.output);
  if (!branchResult.ok) errors.push(branchResult.output);

  return {
    ok: removeResult.ok && branchResult.ok,
    worktreeRemoved: removeResult.ok,
    branchDeleted: branchResult.ok,
    error: errors.length > 0 ? errors.join('\n') : null,
  };
}

/** Get status of a worktree */
function worktreeStatus(taskId, cwd) {
  const worktreePath = getWorktreePath(taskId, cwd);
  const statusResult = git.status(worktreePath);
  return {
    exists: statusResult.ok,
    path: worktreePath,
    branch: `${WORKTREE_PREFIX}${taskId}`,
    dirty: statusResult.ok && statusResult.output.length > 0,
  };
}

module.exports = { createWorktree, mergeWorktree, removeWorktree, worktreeStatus, WORKTREE_PREFIX };
