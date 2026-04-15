/**
 * Command handlers: dag
 */
import { readTask, writeTask, readAllTasks, updateTaskStatus, deleteTask, nextTaskId } from '../state/task-graph.js';
import { appendLog, updatePipelineFields } from '../state/pipeline.js';
import { nextWave, dagStats } from '../dag/scheduler.js';
import { initTasksFromPlan } from '../dag/parser.js';
import { wouldCycle, getDirectDependents, getTransitiveDependents } from '../dag/graph.js';
import { mergeWithPlan } from '../dag/merge.js';
import { visualizeDAG } from '../dag/visualize.js';
import { analyzeCriticalPath } from '../dag/critical-path.js';
import { estimatePERT } from '../dag/estimation.js';
import { calculateEVM } from '../dag/earned-value.js';
import { renderGantt } from '../dag/gantt.js';
import { onTaskComplete } from '../learning/auto-learn.js';
import { recordFailure, recordSuccess } from '../routing/quota.js';
import type { TaskState, TaskStatus, ErrorType } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleDag(args: string[], projectDir: string): any {
  const sub = args[1];

  if (sub === 'init') {
    const result = initTasksFromPlan(projectDir, args[2], args[3], args[4]);
    appendLog(projectDir, `dag init: ${result.count} tasks from ${result.planFile}`);
    return { planFile: result.planFile, count: result.count, tasks: result.tasks.map(t => t.id) };
  }
  if (sub === 'next-wave') {
    return nextWave(readAllTasks(projectDir)).map(t => ({ id: t.id, name: t.name }));
  }
  if (sub === 'complete') {
    const result = updateTaskStatus(projectDir, args[2], 'done' as TaskStatus, { execution: { completedAt: new Date().toISOString() } });
    appendLog(projectDir, `task ${args[2]} completed`);
    try { updatePipelineFields(projectDir, { current_task: null }); } catch { /* ignore */ }
    const completedTask = readTask(projectDir, args[2]);
    if (completedTask?.routing?.target) recordSuccess(projectDir, completedTask.routing.target);
    onTaskComplete(projectDir, args[2], true);
    return result;
  }
  if (sub === 'fail') {
    const taskId = args[2];
    const errorType = args[3];
    if (!taskId || !errorType) throw new Error('Usage: dag fail <task-id> <error-type>');
    const result = updateTaskStatus(projectDir, taskId, 'failed' as TaskStatus, {
      execution: { completedAt: new Date().toISOString(), errorType: errorType as ErrorType, error: errorType },
    });
    appendLog(projectDir, `task ${taskId} failed: ${errorType}`);
    try { updatePipelineFields(projectDir, { current_task: null }); } catch { /* ignore */ }
    if (errorType === 'agent_error') {
      const failedTask = readTask(projectDir, taskId);
      if (failedTask?.routing?.target) recordFailure(projectDir, failedTask.routing.target, errorType);
    }
    onTaskComplete(projectDir, taskId, false);
    return result;
  }
  if (sub === 'retry') {
    const task = readTask(projectDir, args[2]);
    if (!task) throw new Error(`Task ${args[2]} not found`);
    task.status = 'pending';
    task.execution = { ...(task.execution || {}), error: null, errorType: null, completedAt: null };
    task.validation = { ...(task.validation || {}), attempts: 0, results: [] };
    writeTask(projectDir, task);
    return task;
  }
  if (sub === 'skip') {
    const result = updateTaskStatus(projectDir, args[2], 'skipped' as TaskStatus);
    appendLog(projectDir, `task ${args[2]} skipped`);
    return result;
  }
  if (sub === 'unblock') {
    const task = readTask(projectDir, args[2]);
    if (!task) throw new Error(`Task ${args[2]} not found`);
    task.status = 'pending';
    task.blockedBy = [];
    writeTask(projectDir, task);
    return task;
  }
  if (sub === 'status') return dagStats(readAllTasks(projectDir));
  if (sub === 'visualize') return visualizeDAG(readAllTasks(projectDir));
  if (sub === 'critical-path') return analyzeCriticalPath(readAllTasks(projectDir));
  if (sub === 'estimate') return estimatePERT(readAllTasks(projectDir), projectDir);
  if (sub === 'evm') return calculateEVM(projectDir);
  if (sub === 'gantt') return renderGantt(readAllTasks(projectDir));

  // ── v3.9: DAG Change Management ──────────────────────────────

  if (sub === 'add') {
    return dagAdd(args, projectDir);
  }
  if (sub === 'remove') {
    return dagRemove(args, projectDir);
  }
  if (sub === 'add-dep') {
    return dagAddDep(args, projectDir);
  }
  if (sub === 'remove-dep') {
    return dagRemoveDep(args, projectDir);
  }
  if (sub === 're-init') {
    return dagReInit(args, projectDir);
  }
  if (sub === 'scope-cut') {
    return dagScopeCut(args, projectDir);
  }
  if (sub === 'impact') {
    return dagImpact(args, projectDir);
  }
  if (sub === 'move') {
    return dagMove(args, projectDir);
  }

  throw new Error(`Unknown dag subcommand: ${sub}`);
}

// ── Helpers: parse --flag value from args ────────────────────

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

/** Collect positional args before first -- flag (excluding args[0] subcommand and args[1] sub). */
function positionalName(args: string[]): string {
  const parts: string[] = [];
  for (let i = 2; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    parts.push(args[i]);
  }
  return parts.join(' ');
}

// ── dag add <name> [--after <id>] [--files <paths>] [--spec <desc>] ──

function dagAdd(args: string[], projectDir: string) {
  const name = positionalName(args);
  if (!name) throw new Error('Usage: dag add <name> [--after <task-id>] [--files <paths>] [--spec <desc>]');

  const afterId = parseFlag(args, '--after');
  const filesStr = parseFlag(args, '--files');
  const specDesc = parseFlag(args, '--spec');

  // Validate --after target exists
  if (afterId) {
    const dep = readTask(projectDir, afterId);
    if (!dep) throw new Error(`Dependency task ${afterId} not found`);
  }

  const id = nextTaskId(projectDir);
  const files = filesStr ? filesStr.split(',').map(f => f.trim()) : [];

  const task: TaskState = {
    schemaVersion: 2,
    id,
    name,
    milestone: 'M001',
    phase: 'default',
    status: 'pending',
    blockedBy: afterId ? [afterId] : [],
    files,
    spec: {
      description: specDesc || name,
      interface: '',
      acceptance: '',
      completeness: specDesc ? 30 : 10,
    },
    scores: { specScore: 0, complexityScore: 0, isolationScore: 0 },
    routing: { target: 'claude-code', reason: 'runtime-added', needsConfirmation: false, confirmed: false },
    recovery: { strategy: 'checkpoint', checkpointRef: null },
    validation: { gates: [], attempts: 0, maxAttempts: 2, results: [] },
    context: { requiredFiles: files, estimatedTokens: 0 },
    execution: { sessionId: null, startedAt: null, completedAt: null, error: null, errorType: null },
  };

  writeTask(projectDir, task);
  appendLog(projectDir, `dag add: ${id} "${name}"${afterId ? ` after ${afterId}` : ''}`);
  return { added: id, name, blockedBy: task.blockedBy, files };
}

// ── dag remove <task-id> [--cascade|--reparent|--force] ──

function dagRemove(args: string[], projectDir: string) {
  const taskId = args[2];
  if (!taskId || taskId.startsWith('--')) throw new Error('Usage: dag remove <task-id> [--cascade|--reparent|--force]');

  const task = readTask(projectDir, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  // Safety: reject removing done or in_progress tasks
  if (task.status === 'done') throw new Error(`Cannot remove completed task ${taskId}. Use dag skip instead.`);
  if (task.status === 'in_progress') throw new Error(`Cannot remove in-progress task ${taskId}. Wait for completion or fail it first.`);

  const allTasks = readAllTasks(projectDir);
  const directDeps = getDirectDependents(allTasks, taskId);
  const mode = hasFlag(args, '--cascade') ? 'cascade'
    : hasFlag(args, '--reparent') ? 'reparent'
    : 'force';

  const removed: string[] = [taskId];
  const reparented: string[] = [];

  if (mode === 'reparent' && directDeps.length > 0) {
    // Reconnect: each dependent inherits the removed task's blockedBy
    const parentDeps = task.blockedBy || [];
    for (const depId of directDeps) {
      const depTask = readTask(projectDir, depId);
      if (!depTask) continue;
      depTask.blockedBy = depTask.blockedBy.filter(b => b !== taskId);
      depTask.blockedBy.push(...parentDeps.filter(p => !depTask.blockedBy.includes(p) && p !== depId));
      writeTask(projectDir, depTask);
      reparented.push(depId);
    }
  }

  if (mode === 'cascade' && directDeps.length > 0) {
    const transitive = getTransitiveDependents(allTasks, taskId);
    for (const tid of transitive) {
      const t = readTask(projectDir, tid);
      if (t && (t.status === 'pending' || t.status === 'failed')) {
        deleteTask(projectDir, tid);
        removed.push(tid);
      }
    }
  }

  deleteTask(projectDir, taskId);
  appendLog(projectDir, `dag remove: ${taskId} (${mode})${removed.length > 1 ? `, cascade: ${removed.slice(1).join(',')}` : ''}`);
  return { removed, reparented, mode };
}

// ── dag add-dep <task-id> <dep-id> ──

function dagAddDep(args: string[], projectDir: string) {
  const taskId = args[2];
  const depId = args[3];
  if (!taskId || !depId) throw new Error('Usage: dag add-dep <task-id> <dep-id>');

  const task = readTask(projectDir, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const dep = readTask(projectDir, depId);
  if (!dep) throw new Error(`Dependency task ${depId} not found`);

  // Already exists?
  if (task.blockedBy.includes(depId)) {
    return { taskId, depId, action: 'already-exists' };
  }

  // Cycle check
  const allTasks = readAllTasks(projectDir);
  if (wouldCycle(allTasks, taskId, depId)) {
    throw new Error(`Adding dependency ${taskId} → ${depId} would create a cycle`);
  }

  task.blockedBy.push(depId);
  writeTask(projectDir, task);
  appendLog(projectDir, `dag add-dep: ${taskId} → ${depId}`);
  return { taskId, depId, action: 'added', blockedBy: task.blockedBy };
}

// ── dag remove-dep <task-id> <dep-id> ──

function dagRemoveDep(args: string[], projectDir: string) {
  const taskId = args[2];
  const depId = args[3];
  if (!taskId || !depId) throw new Error('Usage: dag remove-dep <task-id> <dep-id>');

  const task = readTask(projectDir, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const before = task.blockedBy.length;
  task.blockedBy = task.blockedBy.filter(b => b !== depId);
  if (task.blockedBy.length === before) {
    return { taskId, depId, action: 'not-found' };
  }

  writeTask(projectDir, task);
  appendLog(projectDir, `dag remove-dep: ${taskId} ↛ ${depId}`);
  return { taskId, depId, action: 'removed', blockedBy: task.blockedBy };
}

// ── dag re-init --merge ──

function dagReInit(args: string[], projectDir: string) {
  if (!hasFlag(args, '--merge')) {
    throw new Error('Usage: dag re-init --merge [plan-file]\nWithout --merge, use "dag init" for fresh initialization.');
  }
  // Find plan file: explicit .md arg or auto-detect
  const explicitPlan = args.find(a => a.endsWith('.md') && !a.startsWith('--'));
  const result = mergeWithPlan(projectDir, explicitPlan);
  appendLog(projectDir, `dag re-init --merge: ${result.added.length} added, ${result.updated.length} updated, ${result.removedCandidates.length} removal candidates`);
  return result;
}

// ── dag scope-cut <id1,id2,...> ──

function dagScopeCut(args: string[], projectDir: string) {
  const idsArg = args[2];
  if (!idsArg) throw new Error('Usage: dag scope-cut <task-id1,task-id2,...>');

  const ids = idsArg.split(',').map(s => s.trim()).filter(Boolean);
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const id of ids) {
    const task = readTask(projectDir, id);
    if (!task) { errors.push(`${id}: not found`); continue; }
    if (task.status === 'done') { errors.push(`${id}: already done`); continue; }
    if (task.status === 'in_progress') { errors.push(`${id}: in progress`); continue; }
    updateTaskStatus(projectDir, id, 'skipped' as TaskStatus);
    skipped.push(id);
  }

  // Compute newly unblocked tasks
  const allTasks = readAllTasks(projectDir);
  const unblocked = nextWave(allTasks).map(t => t.id);

  appendLog(projectDir, `dag scope-cut: skipped ${skipped.join(',')}`);
  return { skipped, unblocked, errors: errors.length > 0 ? errors : undefined };
}

// ── dag impact <task-id> ──

function dagImpact(args: string[], projectDir: string) {
  const taskId = args[2];
  if (!taskId) throw new Error('Usage: dag impact <task-id>');

  const allTasks = readAllTasks(projectDir);
  const task = allTasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const downstream = getTransitiveDependents(allTasks, taskId);
  const directDeps = getDirectDependents(allTasks, taskId);

  // Critical path analysis
  const cpm = analyzeCriticalPath(allTasks);
  const onCriticalPath = cpm.criticalPath.includes(taskId);

  // Simulate removal: what would critical path look like without this task?
  const simTasks = allTasks.filter(t => t.id !== taskId).map(t => ({
    ...t,
    blockedBy: t.blockedBy.filter(b => b !== taskId),
  }));
  const simCpm = simTasks.length > 0 ? analyzeCriticalPath(simTasks) : null;

  return {
    taskId,
    name: task.name,
    status: task.status,
    directDependents: directDeps,
    transitiveDependents: downstream,
    onCriticalPath,
    criticalPathDelta: simCpm ? simCpm.criticalPathDuration - cpm.criticalPathDuration : 0,
    recommendation: downstream.length === 0 ? 'safe-to-remove'
      : onCriticalPath ? 'critical-path-impact'
      : 'has-dependents',
  };
}

// ── dag move <task-id> --after <other-id> ──

function dagMove(args: string[], projectDir: string) {
  const taskId = args[2];
  const afterId = parseFlag(args, '--after');
  if (!taskId || !afterId) throw new Error('Usage: dag move <task-id> --after <other-id>');

  const task = readTask(projectDir, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const target = readTask(projectDir, afterId);
  if (!target) throw new Error(`Target task ${afterId} not found`);

  // Cycle check: setting taskId.blockedBy = [afterId]
  const allTasks = readAllTasks(projectDir);
  // Simulate: remove current deps, add new one
  const simTask = { ...task, blockedBy: [afterId] };
  const simTasks = allTasks.map(t => t.id === taskId ? simTask : t);
  if (wouldCycle(simTasks, taskId, afterId)) {
    throw new Error(`Moving ${taskId} after ${afterId} would create a cycle`);
  }

  const oldDeps = [...task.blockedBy];
  task.blockedBy = [afterId];
  writeTask(projectDir, task);
  appendLog(projectDir, `dag move: ${taskId} → after ${afterId} (was: ${oldDeps.join(',')})`);
  return { taskId, oldBlockedBy: oldDeps, newBlockedBy: [afterId] };
}
