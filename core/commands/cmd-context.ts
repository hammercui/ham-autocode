/**
 * Command handlers: context
 */
import { readTask } from '../state/task-graph.js';
import { ContextBudget } from '../context/budget.js';
import { ContextManager } from '../context/manager.js';
import { summarizeFile } from '../context/summary-cache.js';
import { searchFiles } from '../context/tfidf.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleContext(args: string[], projectDir: string): any {
  const sub = args[1];

  if (sub === 'budget') {
    if (args[2] === 'consume') {
      const amount = parseInt(args[3], 10);
      if (isNaN(amount) || amount < 0) throw new Error('Usage: context budget consume <amount>');
      const budget = new ContextBudget(projectDir);
      budget.consume(amount);
      return budget.status();
    }
    return new ContextBudget(projectDir).status();
  }
  if (sub === 'prepare') {
    const taskId = args[2];
    if (!taskId) throw new Error('Usage: context prepare <task-id>');
    const task = readTask(projectDir, taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const mgr = new ContextManager(projectDir);
    const prepared = mgr.prepareForTask(task);
    const budgetStatus = mgr.budgetStatus();
    return {
      taskId,
      requiredFiles: task.context?.requiredFiles || task.files || [],
      estimatedTokens: mgr.estimateTask(task),
      budgetRemaining: Math.max(0, 100 - budgetStatus.usagePercent),
      recommendation: prepared.recommendation,
    };
  }
  if (sub === 'summary') {
    if (!args[2]) throw new Error('Usage: context summary <file>');
    return summarizeFile(projectDir, args[2]);
  }
  if (sub === 'search') {
    const query = args.slice(2).join(' ');
    if (!query) throw new Error('Usage: context search <query>');
    return searchFiles(projectDir, query);
  }
  throw new Error(`Unknown context subcommand: ${sub}`);
}
