/**
 * Command handlers: trace, session, commit, rules, spec, token
 */
import { loadConfig } from '../state/config.js';
import { readPipeline } from '../state/pipeline.js';
import { readTask, readAllTasks } from '../state/task-graph.js';
import { dagStats } from '../dag/scheduler.js';
import { queryTrace } from '../trace/logger.js';
import { generateSessionReport } from '../trace/report.js';
import { autoCommitTask, rollbackAutoCommit, generateCommitMessage } from '../commit/auto-commit.js';
import { listRules, checkRules, checkRulesSummary } from '../rules/engine.js';
import '../rules/core-rules.js';
import { detectOpenSpec } from '../spec/reader.js';
import { enrichAndSaveTask, enrichAllTasks, calculateSpecScore } from '../spec/enricher.js';
import { syncSpec } from '../spec/sync.js';
import { estimateFileTokens, buildFileIndex } from '../utils/token.js';

/**
 * Single-call session context for SessionStart hook.
 * Replaces 3 separate CLI calls with 1.
 */
function generateSessionContext(projectDir: string): string {
  const pipeline = readPipeline(projectDir);
  if (!pipeline) return '';
  const tasks = readAllTasks(projectDir);
  const dag = tasks.length > 0 ? dagStats(tasks) : null;
  return [
    `ham-autocode: ${pipeline.project} [${pipeline.status}]`,
    dag ? `Progress: ${dag.done}/${dag.total} (${dag.progress}%)` : '',
    pipeline.current_task ? `Current: ${pipeline.current_task}` : '',
  ].filter(Boolean).join(' | ');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleTraceCmd(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'query') {
    const filterArgs: { taskId?: string; result?: string; limit?: number } = {};
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--task' && args[i + 1]) filterArgs.taskId = args[++i];
      else if (args[i] === '--result' && args[i + 1]) filterArgs.result = args[++i];
      else if (args[i] === '--limit' && args[i + 1]) filterArgs.limit = parseInt(args[++i], 10);
    }
    return queryTrace(projectDir, filterArgs);
  }
  throw new Error(`Unknown trace subcommand: ${sub}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSession(args: string[], projectDir: string): any {
  if (args[1] === 'report') return generateSessionReport(projectDir);
  if (args[1] === 'context') return generateSessionContext(projectDir);
  throw new Error(`Unknown session subcommand: ${args[1]}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleCommit(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'auto') {
    const taskId = args[2];
    if (!taskId) throw new Error('Usage: commit auto <task-id>');
    const task = readTask(projectDir, taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    return autoCommitTask(task, projectDir);
  }
  if (sub === 'rollback') return rollbackAutoCommit(projectDir);
  if (sub === 'message') {
    const taskId = args[2];
    if (!taskId) throw new Error('Usage: commit message <task-id>');
    const task = readTask(projectDir, taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    return { message: generateCommitMessage(task) };
  }
  throw new Error(`Unknown commit subcommand: ${sub}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleRules(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'list') return listRules();
  if (sub === 'check') {
    const taskId = args[2];
    const task = taskId ? readTask(projectDir, taskId) : undefined;
    const tasks = readAllTasks(projectDir);
    const config = loadConfig(projectDir);
    const ctx = { projectDir, task: task || undefined, tasks, config, files: task?.files || [] };
    const results = checkRules(ctx);
    return { results, summary: checkRulesSummary(results) };
  }
  throw new Error(`Unknown rules subcommand: ${sub}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSpec(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'detect') return detectOpenSpec(projectDir);
  if (sub === 'enrich') {
    if (!args[2]) throw new Error('Usage: spec enrich <task-id>');
    return enrichAndSaveTask(projectDir, args[2]);
  }
  if (sub === 'enrich-all') return enrichAllTasks(projectDir);
  if (sub === 'score') {
    if (!args[2]) throw new Error('Usage: spec score <task-id>');
    const task = readTask(projectDir, args[2]);
    if (!task) throw new Error(`Task ${args[2]} not found`);
    return { taskId: args[2], specScore: calculateSpecScore(task.spec), spec: task.spec };
  }
  if (sub === 'sync') {
    if (!args[2]) throw new Error('Usage: spec sync <task-id>');
    const task = readTask(projectDir, args[2]);
    if (!task) throw new Error(`Task ${args[2]} not found`);
    return syncSpec(projectDir, args[2], task);
  }
  if (sub === 'analyze') {
    // v4.1: measure spec bloat per field
    const all = readAllTasks(projectDir);
    if (all.length === 0) return { error: 'No tasks found' };
    const tk = (s: string) => Math.ceil((s || '').length / 4);
    const rows = all.map(t => {
      const desc = tk(t.spec?.description || '');
      const iface = tk(t.spec?.interface || '');
      const accept = tk(t.spec?.acceptance || '');
      const files = tk((t.files || []).join(','));
      return {
        id: t.id, name: t.name,
        description: desc, interface: iface, acceptance: accept, files,
        total: desc + iface + accept + files,
      };
    });
    const totals = rows.reduce((a, r) => ({
      description: a.description + r.description,
      interface: a.interface + r.interface,
      acceptance: a.acceptance + r.acceptance,
      files: a.files + r.files,
      total: a.total + r.total,
    }), { description: 0, interface: 0, acceptance: 0, files: 0, total: 0 });
    const pct = (n: number) => totals.total === 0 ? '0%' : `${Math.round((n / totals.total) * 100)}%`;
    return {
      taskCount: all.length,
      avgPerTask: Math.round(totals.total / all.length),
      breakdown: {
        description: { avg: Math.round(totals.description / all.length), pct: pct(totals.description) },
        interface: { avg: Math.round(totals.interface / all.length), pct: pct(totals.interface) },
        acceptance: { avg: Math.round(totals.acceptance / all.length), pct: pct(totals.acceptance) },
        files: { avg: Math.round(totals.files / all.length), pct: pct(totals.files) },
      },
      totals,
      perTask: rows,
    };
  }
  throw new Error(`Unknown spec subcommand: ${sub}. Available: detect|enrich|enrich-all|score|sync|analyze`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleToken(args: string[], projectDir: string): any {
  const sub = args[1];
  if (sub === 'estimate') {
    if (!args[2]) throw new Error('Usage: token estimate <file>');
    return { file: args[2], tokens: estimateFileTokens(args[2]) };
  }
  if (sub === 'index') return buildFileIndex(args[2] || projectDir);
  throw new Error(`Unknown token subcommand: ${sub}`);
}
