import git from '../utils/git.js';
import { loadConfig } from '../state/config.js';
import type { TaskState } from '../types.js';

export interface AutoCommitConfig {
  enabled: boolean;
  messageFormat: string; // default: 'feat({taskId}): {taskName}'
}

export interface AutoCommitResult {
  committed: boolean;
  message?: string;
  error?: string;
  files?: string[];
}

/**
 * Generate commit message from task.
 * Format: feat(task-001): Create user auth module
 */
export function generateCommitMessage(task: TaskState): string {
  return `feat(${task.id}): ${task.name}`;
}

/**
 * Auto-commit task files after validation passes.
 * Only commits if autoCommit is enabled in harness.json.
 * Returns result indicating whether commit happened.
 */
export function autoCommitTask(task: TaskState, projectDir: string): AutoCommitResult {
  // Check if auto-commit is enabled (default: false)
  const config = loadConfig(projectDir);
  const autoCommitEnabled = (config as unknown as Record<string, unknown>).autoCommit === true;

  if (!autoCommitEnabled) {
    return { committed: false, message: 'Auto-commit disabled (set autoCommit: true in harness.json)' };
  }

  const files = task.files || [];
  if (files.length === 0) {
    return { committed: false, message: 'No files to commit' };
  }

  // git add each file
  for (const file of files) {
    const addResult = git.add(file, projectDir);
    if (!addResult.ok) {
      return { committed: false, error: `Failed to add ${file}: ${addResult.output}` };
    }
  }

  // git commit
  const message = generateCommitMessage(task);
  const commitResult = git.commit(message, projectDir);
  if (!commitResult.ok) {
    return { committed: false, error: `Commit failed: ${commitResult.output}` };
  }

  return { committed: true, message, files };
}

/**
 * Rollback the last auto-commit (for failed validation retry).
 * Uses git reset --mixed HEAD~1 to undo commit but keep files.
 */
export function rollbackAutoCommit(projectDir: string): AutoCommitResult {
  const result = git.resetLast(projectDir);
  if (!result.ok) {
    return { committed: false, error: `Rollback failed: ${result.output}` };
  }
  return { committed: false, message: 'Auto-commit rolled back' };
}
