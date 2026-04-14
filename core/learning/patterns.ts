/**
 * Cross-session project patterns — task type statistics + hints.
 * Trimmed in v3.4: removed fileStructure (duplicates Brain), reliableGates (duplicates analyzer),
 * riskyFiles (duplicates Brain painPoints). Kept: commonTaskTypes + getPatternHints.
 */

import path from 'path';
import fs from 'fs';
import { readAllTasks } from '../state/task-graph.js';
import { queryTrace } from '../trace/logger.js';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';

export interface TaskTypeStats {
  type: string;
  count: number;
  avgDuration: number;  // seconds
}

export interface ProjectPatterns {
  schemaVersion: number;
  learnedAt: string;
  commonTaskTypes: TaskTypeStats[];
}

function patternsPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'learning', 'patterns.json');
}

export function readPatterns(projectDir: string): ProjectPatterns | null {
  const { data } = readJSON<ProjectPatterns>(patternsPath(projectDir));
  return data;
}

export function learnPatterns(projectDir: string): ProjectPatterns {
  const tasks = readAllTasks(projectDir);
  const traces = queryTrace(projectDir, { limit: 10000 });

  const typeMap = new Map<string, { count: number; totalDuration: number }>();
  for (const task of tasks) {
    const name = task.name.toLowerCase();
    let type = 'other';
    if (name.includes('test') || name.includes('测试')) type = 'test';
    else if (name.includes('api') || name.includes('接口')) type = 'api';
    else if (name.includes('gui') || name.includes('ui') || name.includes('页面')) type = 'ui';
    else if (name.includes('fix') || name.includes('修复') || name.includes('bug')) type = 'fix';
    else if (name.includes('doc') || name.includes('文档')) type = 'doc';
    else if (name.includes('config') || name.includes('配置')) type = 'config';
    else if (name.includes('refactor') || name.includes('重构')) type = 'refactor';

    const existing = typeMap.get(type) || { count: 0, totalDuration: 0 };
    existing.count++;
    const taskTraces = traces.filter(t => t.taskId === task.id);
    if (taskTraces.length >= 2) {
      const first = new Date(taskTraces[0].time).getTime();
      const last = new Date(taskTraces[taskTraces.length - 1].time).getTime();
      existing.totalDuration += last - first;
    }
    typeMap.set(type, existing);
  }

  const commonTaskTypes: TaskTypeStats[] = [...typeMap.entries()]
    .map(([type, data]) => ({
      type,
      count: data.count,
      avgDuration: data.count > 0 ? Math.round(data.totalDuration / data.count / 1000) : 0,
    }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);

  const patterns: ProjectPatterns = { schemaVersion: 2, learnedAt: new Date().toISOString(), commonTaskTypes };
  const dir = path.dirname(patternsPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteJSON(patternsPath(projectDir), patterns);
  return patterns;
}

/**
 * Get pattern hints for a task — auto-consumed by execute prepare (v3.4).
 */
export function getPatternHints(projectDir: string, taskName: string): string[] {
  const patterns = readPatterns(projectDir);
  if (!patterns) return [];
  const hints: string[] = [];
  const nameLower = taskName.toLowerCase();

  // Find matching task type and report avg duration
  for (const tt of patterns.commonTaskTypes) {
    if (nameLower.includes(tt.type) && tt.avgDuration > 0) {
      hints.push(`Similar "${tt.type}" tasks averaged ${tt.avgDuration}s (${tt.count} samples)`);
    }
  }
  return hints;
}
