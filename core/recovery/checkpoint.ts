/**
 * Git tag-based checkpoint: create, rollback, cleanup.
 * Uses lightweight tags with a prefix to namespace checkpoints.
 * Git subprocesses use argument arrays in core/utils/git.js to avoid shell
 * interpolation of task-controlled values.
 */

import git from '../utils/git.js';
import type { TaskState, RecoveryConfig, RecoveryStrategy } from '../types.js';

export const TAG_PREFIX = 'ham-checkpoint/';

interface CheckpointCreateResult {
  ok: boolean;
  ref: string | null;
  error: string | null;
}

interface CheckpointRollbackResult {
  ok: boolean;
  error: string | null;
}

interface CheckpointCleanupEntry {
  tag: string;
  ok: boolean;
  output: string;
}

/** Create a checkpoint tag before risky operations */
export function createCheckpoint(taskId: string, cwd: string): CheckpointCreateResult {
  const name = `${TAG_PREFIX}${taskId}-${Date.now()}`;
  const result = git.tag(name, cwd);
  if (!result.ok) {
    return { ok: false, ref: null, error: result.output };
  }
  return { ok: true, ref: name, error: null };
}

/** Rollback to a checkpoint by restoring task-specific files from the tag */
export function rollbackToCheckpoint(ref: string, cwd: string, files?: string[]): CheckpointRollbackResult {
  const verify = git.log(1, cwd);
  if (!verify.ok) return { ok: false, error: 'Not a git repository' };

  // If specific files provided, restore only those; otherwise restore all
  if (files && files.length > 0) {
    // Filter to files that actually exist in the checkpoint ref
    // (files may have been renamed/deleted since the checkpoint)
    const validFiles: string[] = [];
    const skippedFiles: string[] = [];
    for (const file of files) {
      const check = git.checkoutFiles(ref, [file], cwd);
      if (check.ok) {
        validFiles.push(file);
      } else {
        skippedFiles.push(file);
      }
    }
    if (validFiles.length === 0 && skippedFiles.length > 0) {
      // None of the files exist in the checkpoint — try full checkout as fallback
      const result = git.checkoutAll(ref, cwd);
      if (!result.ok) return { ok: false, error: `Rollback failed: no matching files in checkpoint. Skipped: ${skippedFiles.join(', ')}` };
    }
    // Partial success is still success
    return { ok: true, error: skippedFiles.length > 0 ? `Skipped missing files: ${skippedFiles.join(', ')}` : null };
  } else {
    const result = git.checkoutAll(ref, cwd);
    if (!result.ok) return { ok: false, error: `Rollback failed: ${result.output}` };
  }
  return { ok: true, error: null };
}

/** List all checkpoint tags */
export function listCheckpoints(cwd: string): string[] {
  const result = git.listTags(`${TAG_PREFIX}*`, cwd);
  if (!result.ok) {
    return [];
  }
  return result.output ? result.output.split('\n').filter(Boolean) : [];
}

/** Clean up checkpoint tags for a specific task */
export function cleanupCheckpoints(taskId: string, cwd: string): CheckpointCleanupEntry[] {
  const prefix = `${TAG_PREFIX}${taskId}-`;
  const tags = listCheckpoints(cwd).filter(t => t.startsWith(prefix));
  const results: CheckpointCleanupEntry[] = [];
  for (const tag of tags) {
    results.push({ tag, ...git.deleteTag(tag, cwd) });
  }
  return results;
}

/** Clean up ALL checkpoint tags */
export function cleanupAllCheckpoints(cwd: string): CheckpointCleanupEntry[] {
  const tags = listCheckpoints(cwd);
  const results: CheckpointCleanupEntry[] = [];
  for (const tag of tags) {
    results.push({ tag, ...git.deleteTag(tag, cwd) });
  }
  return results;
}

/**
 * Gap A7: Auto-select recovery strategy based on task complexity.
 * High-risk tasks (complexityScore >= threshold) use worktree isolation;
 * low-risk tasks use lightweight checkpoint tags.
 */
export function autoSelectStrategy(task: TaskState, config: RecoveryConfig): RecoveryStrategy {
  return task.scores.complexityScore >= config.highRiskThreshold ? 'worktree' : 'checkpoint';
}
