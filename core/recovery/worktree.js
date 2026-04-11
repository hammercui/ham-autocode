// core/recovery/worktree.js
'use strict';
const path = require('path');
const git = require('../utils/git');

const WORKTREE_PREFIX = 'ham-worktree-';

/**
 * Git worktree lifecycle: create, merge, remove.
 * Used for high-risk tasks that need isolation.
 */

/** Create an isolated worktree for a task */
function createWorktree(taskId, cwd) {
  const branch = `${WORKTREE_PREFIX}${taskId}`;
  const worktreePath = path.join(path.dirname(cwd), `.ham-worktrees`, taskId);

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
  const worktreePath = path.join(path.dirname(cwd), `.ham-worktrees`, taskId);

  const removeResult = git.worktreeRemove(worktreePath, cwd);
  const branchResult = git.branchDelete(branch, cwd);

  return {
    ok: removeResult.ok || branchResult.ok,
    worktreeRemoved: removeResult.ok,
    branchDeleted: branchResult.ok,
    error: removeResult.ok ? null : removeResult.output,
  };
}

/** Get status of a worktree */
function worktreeStatus(taskId, cwd) {
  const worktreePath = path.join(path.dirname(cwd), `.ham-worktrees`, taskId);
  const statusResult = git.status(worktreePath);
  return {
    exists: statusResult.ok,
    path: worktreePath,
    branch: `${WORKTREE_PREFIX}${taskId}`,
    dirty: statusResult.ok && statusResult.output.length > 0,
  };
}

module.exports = { createWorktree, mergeWorktree, removeWorktree, worktreeStatus, WORKTREE_PREFIX };
