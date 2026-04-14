/**
 * Command handlers: execute, validate, recover
 */
import { readTask, writeTask } from '../state/task-graph.js';
import { detectGates } from '../validation/detector.js';
import { validateTask } from '../validation/gates.js';
import { createCheckpoint, rollbackToCheckpoint as doRollback } from '../recovery/checkpoint.js';
import { createWorktree, mergeWorktree, removeWorktree } from '../recovery/worktree.js';
import { ClaudeCodeAdapter } from '../executor/claude-code.js';
import { CodexAdapter } from '../executor/codex.js';
import { ClaudeAppAdapter } from '../executor/claude-app.js';
import { AgentTeamsAdapter } from '../executor/agent-teams.js';
import { OpenCodeAdapter } from '../executor/opencode.js';
import { getBrainContext } from '../learning/project-brain.js';
import type { RoutingTarget } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleExecute(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'prepare') {
    const taskId = args[2];
    if (!taskId) throw new Error('Usage: execute prepare <task-id>');
    const task = readTask(projectDir, taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const target: RoutingTarget = task.routing?.target || 'claude-code';
    const adapters: Record<RoutingTarget, { generateInstruction(t: typeof task): string }> = {
      'claude-code': new ClaudeCodeAdapter(),
      'codex': new CodexAdapter(),
      'claude-app': new ClaudeAppAdapter(),
      'agent-teams': new AgentTeamsAdapter(),
      'opencode': new OpenCodeAdapter(),
    };
    const adapter = adapters[target];
    if (!adapter) throw new Error(`Unknown routing target: ${target}`);
    const instruction = adapter.generateInstruction(task);
    const brainContext = getBrainContext(projectDir, task.name);
    const enrichedInstruction = brainContext ? instruction + '\n\n' + brainContext : instruction;
    return { taskId, target, instruction: enrichedInstruction };
  }
  throw new Error(`Unknown execute subcommand: ${sub}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleValidate(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'detect') return detectGates(projectDir);
  const taskId = sub;
  if (!taskId) throw new Error('Usage: validate <task-id>');
  const task = readTask(projectDir, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const result = validateTask(task, projectDir, doRollback);
  task.validation = {
    ...(task.validation || {}),
    attempts: result.attempts, maxAttempts: result.maxAttempts,
    results: result.results, gates: result.gates,
  };
  writeTask(projectDir, task);
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleRecover(args: string[], projectDir: string): any {
  const sub = args[1];
  if (!sub) throw new Error('Usage: recover <subcommand> <task-id>');
  const taskId = args[2];
  if (!taskId) throw new Error(`Usage: recover ${sub} <task-id>`);
  const task = readTask(projectDir, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  if (sub === 'checkpoint') {
    const result = createCheckpoint(taskId, projectDir);
    if (result.ok) {
      task.recovery = { ...(task.recovery || {}), strategy: 'checkpoint', checkpointRef: result.ref };
      writeTask(projectDir, task);
    }
    return result;
  }
  if (sub === 'rollback') {
    const ref = task.recovery?.checkpointRef;
    if (!ref) throw new Error(`Task ${taskId} has no checkpoint`);
    return doRollback(ref, projectDir, task.files || []);
  }
  if (sub === 'worktree-create') {
    const result = createWorktree(taskId, projectDir);
    if (result.ok) {
      task.recovery = { ...(task.recovery || {}), strategy: 'worktree', worktreePath: result.path, branch: result.branch };
      writeTask(projectDir, task);
    }
    return result;
  }
  if (sub === 'worktree-merge') return mergeWorktree(taskId, projectDir);
  if (sub === 'worktree-remove') return removeWorktree(taskId, projectDir);
  throw new Error(`Unknown recover subcommand: ${sub}`);
}
