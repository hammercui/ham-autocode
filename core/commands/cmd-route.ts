/**
 * Command handlers: route, teams, quota
 */
import { loadConfig } from '../state/config.js';
import { readTask, writeTask, readAllTasks } from '../state/task-graph.js';
import { nextWave } from '../dag/scheduler.js';
import { routeTask, routeAllTasks, shouldUseAgentTeams } from '../routing/router.js';
import { AgentTeamsAdapter } from '../executor/agent-teams.js';
import { markUnavailable, markAvailable, quotaStatus } from '../routing/quota.js';
import type { RoutingTarget } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleRoute(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'batch') {
    return routeAllTasks(readAllTasks(projectDir), projectDir).map(t => ({ id: t.id, routing: t.routing }));
  }
  if (sub === 'confirm') {
    const taskId = args[2];
    if (!taskId) throw new Error('Usage: route confirm <task-id>');
    const task = readTask(projectDir, taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    task.routing = { ...(task.routing || {} as any), confirmed: true, needsConfirmation: false };
    writeTask(projectDir, task);
    return task.routing;
  }
  const taskId = sub;
  if (!taskId) throw new Error('Usage: route <task-id>');
  const task = readTask(projectDir, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  return routeTask(task, readAllTasks(projectDir), projectDir);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleTeams(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'assign') {
    return AgentTeamsAdapter.assignTeammates(nextWave(readAllTasks(projectDir)));
  }
  if (sub === 'should-use') {
    const tasks = readAllTasks(projectDir);
    const wave = nextWave(tasks);
    const config = loadConfig(projectDir);
    return { shouldUse: shouldUseAgentTeams(wave, config), waveSize: wave.length };
  }
  throw new Error('Unknown teams subcommand. Use: assign, should-use');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleQuota(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'status') return quotaStatus(projectDir);
  if (sub === 'mark-unavailable') {
    const target = args[2] as RoutingTarget;
    const reason = args.slice(3).join(' ');
    if (!target || !reason) throw new Error('Usage: quota mark-unavailable <target> <reason>');
    return markUnavailable(projectDir, target, reason);
  }
  if (sub === 'mark-available') {
    const target = args[2] as RoutingTarget;
    if (!target) throw new Error('Usage: quota mark-available <target>');
    return markAvailable(projectDir, target);
  }
  throw new Error('Unknown quota subcommand. Use: status, mark-unavailable, mark-available');
}
