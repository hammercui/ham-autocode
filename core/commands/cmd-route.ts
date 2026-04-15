/**
 * Command handlers: route, teams, quota
 */
import { loadConfig } from '../state/config.js';
import { readTask, writeTask, readAllTasks } from '../state/task-graph.js';
import { nextWave } from '../dag/scheduler.js';
import { routeTask, routeAllTasks, shouldUseAgentTeams } from '../routing/router.js';
import { scoreTask } from '../routing/scorer.js';
import { AgentTeamsAdapter } from '../executor/agent-teams.js';
import { quotaStatus } from '../routing/quota.js';
// RoutingTarget 已在精简后不再直接使用

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
  // v3.5: persist routing result back to task file
  const allTasks = readAllTasks(projectDir);
  const routing = routeTask(task, allTasks, projectDir);
  task.routing = routing;
  task.scores = scoreTask(task, allTasks);
  writeTask(projectDir, task);
  return { ...routing, scores: task.scores };
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
  throw new Error('Unknown quota subcommand. Available: status');
}
