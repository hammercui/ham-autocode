import type { TaskState } from '../types.js';
import { analyzeCriticalPath } from './critical-path.js';
import { topoSort } from './graph.js';

/**
 * 渲染 ASCII 甘特图。
 * 关键路径任务用 █ 标红，非关键用 ░。
 */
export function renderGantt(tasks: TaskState[]): string {
  if (tasks.length === 0) return '(no tasks)';

  const cpm = analyzeCriticalPath(tasks);
  const criticalSet = new Set(cpm.criticalPath);
  const maxNameLen = Math.min(40, Math.max(...tasks.map(t => t.name.length)));
  const totalDuration = cpm.criticalPathDuration || 1;

  // 规范化到 40 列宽
  const COLS = 40;
  const scale = COLS / totalDuration;

  const lines: string[] = [];
  lines.push(`Gantt Chart (duration: ${totalDuration} units, parallelism: ${cpm.parallelism})`);
  lines.push('');

  // 计算每个任务的开始/结束位置
  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  // 正向遍历（使用 topoSort 排序）
  const { sorted } = topoSort(tasks);
  for (const t of sorted) {
    const deps = (t.blockedBy || []).filter((d: string) => es.has(d));
    const start = deps.length > 0 ? Math.max(...deps.map((d: string) => ef.get(d) || 0)) : 0;
    const dur = Math.max(1, t.scores?.complexityScore || 10);
    es.set(t.id, start);
    ef.set(t.id, start + dur);
  }

  for (const t of sorted) {
    const start = Math.round((es.get(t.id) || 0) * scale);
    const dur = Math.max(1, Math.round((t.scores?.complexityScore || 10) * scale));
    const end = Math.min(start + dur, COLS);
    const isCritical = criticalSet.has(t.id);

    const name = t.name.substring(0, maxNameLen).padEnd(maxNameLen);
    const bar = ' '.repeat(start) + (isCritical ? '\u2588' : '\u2591').repeat(end - start) + ' '.repeat(Math.max(0, COLS - end));

    const statusIcon = t.status === 'done' ? '\u2713' : t.status === 'failed' ? '\u2717' : t.status === 'skipped' ? '\u2298' : '\u25CB';
    const label = isCritical ? ' *' : '';

    lines.push(`${statusIcon} ${name} |${bar}|${label}`);
  }

  // 时间轴
  const axis = ' '.repeat(maxNameLen + 2) + '|' + '-'.repeat(COLS) + '|';
  const halfLabel = Math.round(totalDuration / 2).toString();
  const endLabel = totalDuration.toString();
  const labels = ' '.repeat(maxNameLen + 2) + '0' + ' '.repeat(COLS / 2 - 1) + halfLabel + ' '.repeat(COLS / 2 - 1) + endLabel;
  lines.push(axis);
  lines.push(labels);

  if (cpm.bottlenecks.length > 0) {
    lines.push('');
    lines.push(`Bottlenecks: ${cpm.bottlenecks.join(', ')}`);
  }
  lines.push(`Critical path: ${cpm.criticalPath.join(' \u2192 ')}`);

  return lines.join('\n');
}
