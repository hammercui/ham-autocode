/**
 * Command handlers: dag
 */
import { readTask, writeTask, readAllTasks, updateTaskStatus } from '../state/task-graph.js';
import { appendLog, updatePipelineFields } from '../state/pipeline.js';
import { nextWave, dagStats } from '../dag/scheduler.js';
import { initTasksFromPlan } from '../dag/parser.js';
import { visualizeDAG } from '../dag/visualize.js';
import { analyzeCriticalPath } from '../dag/critical-path.js';
import { estimatePERT } from '../dag/estimation.js';
import { calculateEVM } from '../dag/earned-value.js';
import { renderGantt } from '../dag/gantt.js';
import { onTaskComplete } from '../learning/auto-learn.js';
import { recordFailure, recordSuccess } from '../routing/quota.js';
import type { TaskStatus, ErrorType } from '../types.js';

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
  throw new Error(`Unknown dag subcommand: ${sub}`);
}
