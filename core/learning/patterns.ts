import fs from 'fs';
import path from 'path';
import { readAllTasks } from '../state/task-graph.js';
import { queryTrace } from '../trace/logger.js';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';

export interface DirStats {
  dir: string;
  fileCount: number;
  dominantExt: string;
}

export interface TaskTypeStats {
  type: string;
  count: number;
  avgDuration: number;
}

export interface GateStats {
  gate: string;
  passRate: number;
}

export interface RiskyFile {
  file: string;
  failureCount: number;
}

export interface ProjectPatterns {
  schemaVersion: number;
  learnedAt: string;
  fileStructure: DirStats[];
  commonTaskTypes: TaskTypeStats[];
  reliableGates: GateStats[];
  riskyFiles: RiskyFile[];
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

  // File structure analysis: scan project dirs (not .ham-autocode, not node_modules)
  const fileStructure: DirStats[] = [];
  const scanDir = (dir: string, depth: number): void => {
    if (depth > 3) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files = entries.filter(e => e.isFile());
      if (files.length > 0) {
        const extMap = new Map<string, number>();
        for (const f of files) {
          const ext = path.extname(f.name) || '(none)';
          extMap.set(ext, (extMap.get(ext) || 0) + 1);
        }
        const dominant = [...extMap.entries()].sort((a, b) => b[1] - a[1])[0];
        const relDir = path.relative(projectDir, dir).replace(/\\/g, '/') || '.';
        fileStructure.push({
          dir: relDir,
          fileCount: files.length,
          dominantExt: dominant ? dominant[0] : '',
        });
      }
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist') {
          scanDir(path.join(dir, e.name), depth + 1);
        }
      }
    } catch { /* ignore permission errors */ }
  };
  scanDir(projectDir, 0);

  // Common task types: infer type from task name keywords
  const typeMap = new Map<string, { count: number; totalDuration: number }>();
  for (const task of tasks) {
    const name = task.name.toLowerCase();
    let type = 'other';
    if (name.includes('test') || name.includes('\u6D4B\u8BD5')) type = 'test';
    else if (name.includes('api') || name.includes('\u63A5\u53E3')) type = 'api';
    else if (name.includes('gui') || name.includes('ui') || name.includes('\u9875\u9762') || name.includes('\u7EC4\u4EF6')) type = 'ui';
    else if (name.includes('fix') || name.includes('\u4FEE\u590D') || name.includes('bug')) type = 'fix';
    else if (name.includes('doc') || name.includes('\u6587\u6863')) type = 'doc';
    else if (name.includes('config') || name.includes('\u914D\u7F6E')) type = 'config';
    else if (name.includes('refactor') || name.includes('\u91CD\u6784')) type = 'refactor';

    const existing = typeMap.get(type) || { count: 0, totalDuration: 0 };
    existing.count++;
    // Estimate duration from trace timestamps for tasks with matching IDs
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

  // Gate reliability: from task validation results
  const gateMap = new Map<string, { passed: number; total: number }>();
  for (const task of tasks) {
    if (task.validation?.results) {
      for (const result of task.validation.results) {
        const gate = result.gate || 'unknown';
        const existing = gateMap.get(gate) || { passed: 0, total: 0 };
        existing.total++;
        if (result.pass) existing.passed++;
        gateMap.set(gate, existing);
      }
    }
  }
  const reliableGates: GateStats[] = [...gateMap.entries()]
    .map(([gate, data]) => ({
      gate,
      passRate: data.total > 0 ? Math.round(data.passed / data.total * 100) : 0,
    }))
    .sort((a, b) => b.passRate - a.passRate);

  // Risky files: files that appear in failed tasks
  const fileFailMap = new Map<string, number>();
  for (const task of tasks.filter(t => t.status === 'failed')) {
    for (const file of task.files || []) {
      fileFailMap.set(file, (fileFailMap.get(file) || 0) + 1);
    }
  }
  const riskyFiles: RiskyFile[] = [...fileFailMap.entries()]
    .map(([file, failureCount]) => ({ file, failureCount }))
    .filter(f => f.failureCount > 0)
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, 20);

  const patterns: ProjectPatterns = {
    schemaVersion: 1,
    learnedAt: new Date().toISOString(),
    fileStructure,
    commonTaskTypes,
    reliableGates,
    riskyFiles,
  };

  // Persist
  const dir = path.dirname(patternsPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteJSON(patternsPath(projectDir), patterns);

  return patterns;
}

/**
 * Get pattern-based hints for a task (used by spec enricher)
 */
export function getPatternHints(projectDir: string, taskName: string): string[] {
  const patterns = readPatterns(projectDir);
  if (!patterns) return [];

  const hints: string[] = [];
  const nameLower = taskName.toLowerCase();

  // Suggest likely directories based on task type
  for (const dir of patterns.fileStructure) {
    if (nameLower.includes('api') && dir.dir.includes('api')) {
      hints.push(`API files likely in ${dir.dir}/ (${dir.fileCount} files, mostly ${dir.dominantExt})`);
    }
    if ((nameLower.includes('ui') || nameLower.includes('gui') || nameLower.includes('\u9875\u9762')) &&
        (dir.dir.includes('renderer') || dir.dir.includes('components') || dir.dir.includes('pages'))) {
      hints.push(`UI files likely in ${dir.dir}/ (${dir.fileCount} files, mostly ${dir.dominantExt})`);
    }
    if (nameLower.includes('test') && (dir.dir.includes('test') || dir.dir.includes('__tests__'))) {
      hints.push(`Test files in ${dir.dir}/ (${dir.fileCount} files)`);
    }
  }

  // Warn about risky files
  for (const risky of patterns.riskyFiles.slice(0, 5)) {
    if (nameLower.includes(path.basename(risky.file, path.extname(risky.file)).toLowerCase())) {
      hints.push(`Warning: ${risky.file} has failed in ${risky.failureCount} previous task(s)`);
    }
  }

  return hints;
}
