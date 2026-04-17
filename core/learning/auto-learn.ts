/**
 * Auto-learning: triggered on task completion/failure.
 * v3.9.1: 精简为只做 brain 演化 + entity 索引。
 * 删除了 insights/patterns/guard/field-test（无实际价值，参见 Harness Engineering 四大支柱分析）。
 */

import { evolveFromTask, readBrain, saveBrain } from './project-brain.js';
import { readTask } from '../state/task-graph.js';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';
import path from 'path';
import fs from 'fs';

interface AutoLearnState {
  totalCompletions: number;
  totalFailures: number;
}

function statePath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'learning', 'auto-state.json');
}

function loadState(projectDir: string): AutoLearnState {
  const { data } = readJSON<AutoLearnState>(statePath(projectDir));
  return data || { totalCompletions: 0, totalFailures: 0 };
}

function saveState(projectDir: string, state: AutoLearnState): void {
  const dir = path.dirname(statePath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteJSON(statePath(projectDir), state);
}

/**
 * Called after dag complete / dag fail.
 * 只做两件事：brain 演化（项目理解） + entity 增量索引（上下文搜索）。
 */
export function onTaskComplete(projectDir: string, taskId: string, success: boolean): void {
  try {
    const state = loadState(projectDir);
    if (success) { state.totalCompletions++; } else { state.totalFailures++; }

    const task = readTask(projectDir, taskId);

    // Brain 演化：从任务文件中学习项目架构（~10ms）
    if (task) {
      evolveFromTask(projectDir, task);
    }

    // 消费 PostToolUse 观察日志 → 文件共现关系
    consumeObservations(projectDir);

    saveState(projectDir, state);
  } catch {
    // best-effort, never fail the main operation
  }
}

/** Get auto-learn status for display. */
export function autoLearnStatus(projectDir: string): AutoLearnState {
  return loadState(projectDir);
}

/**
 * Consume PostToolUse observations → file co-occurrence in brain.
 */
function consumeObservations(projectDir: string): void {
  const obsPath = path.join(projectDir, '.ham-autocode', 'learning', 'observations.jsonl');
  if (!fs.existsSync(obsPath)) return;

  try {
    const raw = fs.readFileSync(obsPath, 'utf-8').trim();
    if (!raw) return;

    const files: string[] = [];
    for (const line of raw.split('\n')) {
      try {
        const obs = JSON.parse(line);
        if (obs.file) files.push(obs.file);
      } catch { /* skip malformed lines */ }
    }

    if (files.length >= 2) {
      const brain = readBrain(projectDir);
      const unique = [...new Set(files)];
      for (let i = 0; i < unique.length && i < 5; i++) {
        for (let j = i + 1; j < unique.length && j < 5; j++) {
          const conn = `${path.basename(unique[i])} ↔ ${path.basename(unique[j])}`;
          if (!brain.architecture.connections.includes(conn)) {
            brain.architecture.connections.push(conn);
          }
        }
      }
      if (brain.architecture.connections.length > 20) {
        brain.architecture.connections = brain.architecture.connections.slice(-20);
      }
      saveBrain(projectDir, brain);
    }

    fs.writeFileSync(obsPath, '', 'utf-8');
  } catch { /* best-effort */ }
}
