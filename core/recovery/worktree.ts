/**
 * Git worktree lifecycle: create, merge, remove.
 * Used for high-risk tasks that need isolation.
 */

import path from 'path';
import git from '../utils/git.js';

export const WORKTREE_PREFIX = 'ham-wt-';

interface WorktreeCreateResult {
  ok: boolean;
  path: string | null;
  branch: string | null;
  error: string | null;
}

interface WorktreeMergeResult {
  ok: boolean;
  error: string | null;
  conflicts: boolean;
}

interface WorktreeRemoveResult {
  ok: boolean;
  worktreeRemoved: boolean;
  branchDeleted: boolean;
  error: string | null;
}

interface WorktreeStatusResult {
  exists: boolean;
  path: string;
  branch: string;
  dirty: boolean;
}

function getWorktreePath(taskId: string, cwd: string): string {
  return path.join(cwd, '.ham-autocode', 'worktrees', taskId);
}

/** Create an isolated worktree for a task */
export function createWorktree(taskId: string, cwd: string): WorktreeCreateResult {
  const branch = `${WORKTREE_PREFIX}${taskId}`;
  const worktreePath = getWorktreePath(taskId, cwd);

  const result = git.worktreeAdd(worktreePath, branch, cwd);
  if (!result.ok) {
    return { ok: false, path: null, branch: null, error: result.output };
  }
  return { ok: true, path: worktreePath, branch, error: null };
}

/** Merge worktree branch back into current branch */
export function mergeWorktree(taskId: string, cwd: string): WorktreeMergeResult {
  const branch = `${WORKTREE_PREFIX}${taskId}`;
  const result = git.merge(branch, cwd);
  if (!result.ok) {
    return { ok: false, error: result.output, conflicts: result.output.includes('CONFLICT') };
  }
  return { ok: true, error: null, conflicts: false };
}

/** Remove a worktree and its branch */
export function removeWorktree(taskId: string, cwd: string): WorktreeRemoveResult {
  const branch = `${WORKTREE_PREFIX}${taskId}`;
  const worktreePath = getWorktreePath(taskId, cwd);

  const removeResult = git.worktreeRemove(worktreePath, cwd);
  const branchResult = git.branchDelete(branch, cwd);
  const errors: string[] = [];
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
export function worktreeStatus(taskId: string, cwd: string): WorktreeStatusResult {
  const worktreePath = getWorktreePath(taskId, cwd);
  const statusResult = git.status(worktreePath);
  return {
    exists: statusResult.ok,
    path: worktreePath,
    branch: `${WORKTREE_PREFIX}${taskId}`,
    dirty: statusResult.ok && statusResult.output.length > 0,
  };
}
