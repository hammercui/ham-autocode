/**
 * Command handlers: context
 * v3.9.1: 精简为 summary 只保留实际使用的功能
 * v4.1: 新增 analyze — 离线瘦身分析（brain/entities token 占比）
 */
import { summarizeFile } from '../context/summary-cache.js';
import { breakdownClaudeCodeContext } from '../executor/context-template.js';
import { readAllTasks } from '../state/task-graph.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleContext(args: string[], projectDir: string): any {
  const sub = args[1];

  if (sub === 'summary') {
    if (!args[2]) throw new Error('Usage: context summary <file>');
    return summarizeFile(projectDir, args[2]);
  }

  if (sub === 'analyze') {
    const tasks = readAllTasks(projectDir);
    if (tasks.length === 0) {
      return { error: 'No tasks found. Run in a project with .planning/ tasks.' };
    }
    const breakdowns = tasks.map(t => ({ id: t.id, name: t.name, ...breakdownClaudeCodeContext(projectDir, t) }));
    const totals = { spec: 0, brain: 0, entities: 0, dependencies: 0, hints: 0 };
    let grand = 0;
    for (const b of breakdowns) {
      totals.spec += b.sections.spec;
      totals.brain += b.sections.brain;
      totals.entities += b.sections.entities;
      totals.dependencies += b.sections.dependencies;
      totals.hints += b.sections.hints;
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
        entities: { tokens: totals.entities, pct: pct(totals.entities), slimmable: true },
        dependencies: { tokens: totals.dependencies, pct: pct(totals.dependencies) },
        hints: { tokens: totals.hints, pct: pct(totals.hints) },
      },
      slimmableTotal: {
        tokens: totals.brain + totals.entities,
        pct: pct(totals.brain + totals.entities),
      },
      perTask: breakdowns,
    };
  }

  throw new Error(`Unknown context subcommand: ${sub}. Available: summary, analyze`);
}
