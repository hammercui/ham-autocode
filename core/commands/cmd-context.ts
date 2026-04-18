/**
 * Command handlers: context
 * v3.9.1: 精简为 summary 只保留实际使用的功能
 * v4.1: 新增 analyze — 离线瘦身分析（brain/entities token 占比）
 */
import { summarizeFile } from '../context/summary-cache.js';
import { breakdownClaudeCodeContext } from '../executor/context-template.js';
import { readAllTasks, readTask } from '../state/task-graph.js';
import { buildTreeContext, contextForFiles } from '../context/hierarchical.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleContext(args: string[], projectDir: string): any {
  const sub = args[1];

  if (sub === 'summary') {
    if (!args[2]) throw new Error('Usage: context summary <file>');
    return summarizeFile(projectDir, args[2]);
  }

  // v4.2: 分层 CONTEXT.md (LSP-based)
  if (sub === 'build') {
    return buildTreeContext(projectDir, { log: (m) => process.stderr.write(`[ctx] ${m}\n`) });
  }

  if (sub === 'for-task') {
    if (!args[2]) throw new Error('Usage: context for-task <task-id>');
    const task = readTask(projectDir, args[2]);
    if (!task) throw new Error(`Task ${args[2]} not found`);
    const files = task.files || [];
    if (files.length === 0) return { taskId: task.id, context: '', note: 'task has no files' };
    const ctx = contextForFiles(projectDir, files);
    return { taskId: task.id, files, contextChars: ctx.length, context: ctx };
  }

  if (sub === 'for-files') {
    const files = args.slice(2);
    if (files.length === 0) throw new Error('Usage: context for-files <file1> [file2...]');
    const ctx = contextForFiles(projectDir, files);
    return { files, contextChars: ctx.length, context: ctx };
  }

  if (sub === 'analyze') {
    const tasks = readAllTasks(projectDir);
    if (tasks.length === 0) {
      return { error: 'No tasks found. Run in a project with .planning/ tasks.' };
    }
    const breakdowns = tasks.map(t => ({ id: t.id, name: t.name, ...breakdownClaudeCodeContext(projectDir, t) }));
    const totals = { spec: 0, brain: 0, dependencies: 0 };
    let grand = 0;
    for (const b of breakdowns) {
      totals.spec += b.sections.spec;
      totals.brain += b.sections.brain;
      totals.dependencies += b.sections.dependencies;
      grand += b.total;
    }
    const pct = (n: number) => grand === 0 ? '0%' : `${Math.round((n / grand) * 100)}%`;
    return {
      taskCount: tasks.length,
      totalTokens: grand,
      avgPerTask: Math.round(grand / tasks.length),
      breakdown: {
        spec: { tokens: totals.spec, pct: pct(totals.spec) },
        brain: { tokens: totals.brain, pct: pct(totals.brain), slimmable: true },
        dependencies: { tokens: totals.dependencies, pct: pct(totals.dependencies) },
      },
      perTask: breakdowns,
    };
  }

  throw new Error(`Unknown context subcommand: ${sub}. Available: summary, analyze, build, for-task, for-files`);
}
