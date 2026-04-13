import type { TaskState } from '../types.js';

const STATUS_ICONS: Record<string, string> = {
  done: '\u2713',
  failed: '\u2717',
  in_progress: '\u231B',
  pending: '\u25CB',
  skipped: '\u2298',
  blocked: '\u25A0',
};

function icon(status: string): string {
  return STATUS_ICONS[status] ?? '?';
}

/**
 * Render an ASCII DAG of tasks showing dependency relationships.
 *
 * Root tasks (no dependencies) are shown at top level.
 * Dependent tasks are indented under their last dependency.
 */
export function visualizeDAG(tasks: TaskState[]): string {
  if (tasks.length === 0) return '(no tasks)';

  const taskMap = new Map<string, TaskState>();
  for (const t of tasks) taskMap.set(t.id, t);

  // Build children map: parent -> children that depend on it
  const children = new Map<string, string[]>();
  const roots: string[] = [];

  for (const t of tasks) {
    if (!t.blockedBy || t.blockedBy.length === 0) {
      roots.push(t.id);
    } else {
      // Attach to last dependency for display purposes
      const parent = t.blockedBy[t.blockedBy.length - 1];
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(t.id);
    }
  }

  const lines: string[] = [];

  function renderTask(taskId: string, indent: string, isLast: boolean): void {
    const task = taskMap.get(taskId);
    if (!task) return;

    const prefix = indent === '' ? '' : (isLast ? '\u2514\u2192 ' : '\u251C\u2192 ');
    lines.push(`${indent}${prefix}[${task.id} ${icon(task.status)}] ${task.name}`);

    const kids = children.get(taskId) || [];
    const childIndent = indent === '' ? '  ' : indent + (isLast ? '   ' : '\u2502  ');
    for (let i = 0; i < kids.length; i++) {
      renderTask(kids[i], childIndent, i === kids.length - 1);
    }
  }

  for (let i = 0; i < roots.length; i++) {
    renderTask(roots[i], '', true);
  }

  return lines.join('\n');
}
