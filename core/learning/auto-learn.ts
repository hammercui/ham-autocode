/**
 * Auto-learning: triggered automatically on task completion/failure.
 * No manual commands needed — every task outcome improves future decisions.
 *
 * Lightweight by design: runs in <50ms, never blocks the main operation.
 * Full analysis triggers every N completions (default 5).
 */

import { analyzeHistory, readInsights } from './analyzer.js';
import { appendToHistory } from './adapter.js';
import { learnPatterns } from './patterns.js';
import { evolveFromTask } from './project-brain.js';
import { incrementalIndexFiles } from './code-entities.js';
import { checkGuard } from './memory-guard.js';
import { autoDetectFindings } from './field-test.js';
import { readTask, writeTask } from '../state/task-graph.js';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';
import path from 'path';
import fs from 'fs';

interface AutoLearnState {
  completionsSinceLastAnalysis: number;
  lastAnalyzedAt: string | null;
  totalCompletions: number;
  totalFailures: number;
}

const ANALYSIS_INTERVAL = 5; // Run full analysis every N task completions

function statePath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'learning', 'auto-state.json');
}

function loadState(projectDir: string): AutoLearnState {
  const { data } = readJSON<AutoLearnState>(statePath(projectDir));
  return data || {
    completionsSinceLastAnalysis: 0,
    lastAnalyzedAt: null,
    totalCompletions: 0,
    totalFailures: 0,
  };
}

function saveState(projectDir: string, state: AutoLearnState): void {
  const dir = path.dirname(statePath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteJSON(statePath(projectDir), state);
}

/**
 * Called automatically after dag complete / dag fail.
 * Lightweight: increments counters, triggers full analysis periodically.
 */
export function onTaskComplete(projectDir: string, taskId: string, success: boolean): void {
  try {
    const state = loadState(projectDir);

    if (success) {
      state.totalCompletions++;
    } else {
      state.totalFailures++;
    }
    state.completionsSinceLastAnalysis++;

    // Evolve project brain from every task (lightweight, ~10ms)
    const task = readTask(projectDir, taskId);
    if (task) {
      evolveFromTask(projectDir, task);
    }

    // v3.5: Consume PostToolUse observations → file co-occurrence
    consumeObservations(projectDir);

    // Memory Guard: check for problems after every task
    if (task) {
      const guardResult = checkGuard(projectDir, task.files || []);
      if (!guardResult.passed) {
        const guardLogPath = path.join(projectDir, '.ham-autocode', 'learning', 'guard-log.json');
        const dir = path.dirname(guardLogPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        atomicWriteJSON(guardLogPath, guardResult);
        // v3.4: inject guard warnings into task context for next execute prepare
        if (guardResult.suggestions.length > 0) {
          task.spec = { ...(task.spec || { description: '', interface: '', acceptance: '', completeness: 0 }) };
          task.spec.acceptance = (task.spec.acceptance || '') +
            '\n[Guard] ' + guardResult.suggestions.slice(0, 3).join('; ');
          writeTask(projectDir, task);
        }
      }
    }

    // v3.2: Field test auto-detection (record anomalies)
    if (task) {
      autoDetectFindings(projectDir, {
        taskName: task.name,
        success,
        error: task.execution?.error || undefined,
        files: task.files,
      });
    }

    // Trigger full analysis every N completions
    if (state.completionsSinceLastAnalysis >= ANALYSIS_INTERVAL) {
      const insights = analyzeHistory(projectDir);
      appendToHistory(projectDir, insights);
      learnPatterns(projectDir);

      // v3.4: incremental entity index (only current task files)
      if (task?.files && task.files.length > 0) {
        incrementalIndexFiles(projectDir, task.files);
      }

      state.completionsSinceLastAnalysis = 0;
      state.lastAnalyzedAt = new Date().toISOString();
    }

    saveState(projectDir, state);
  } catch {
    // Auto-learn is best-effort, never fail the main operation
  }
}

/**
 * Get auto-learn status for display.
 */
export function autoLearnStatus(projectDir: string): AutoLearnState & { nextAnalysisIn: number; hasInsights: boolean } {
  const state = loadState(projectDir);
  const insights = readInsights(projectDir);
  return {
    ...state,
    nextAnalysisIn: ANALYSIS_INTERVAL - state.completionsSinceLastAnalysis,
    hasInsights: insights !== null,
  };
}

/**
 * v3.5: Consume PostToolUse observations and extract file co-occurrence patterns.
 * Reads observations.jsonl written by the hook, identifies files frequently edited together,
 * and records connections in the project brain.
 */
function consumeObservations(projectDir: string): void {
  const obsPath = path.join(projectDir, '.ham-autocode', 'learning', 'observations.jsonl');
  if (!fs.existsSync(obsPath)) return;

  try {
    const raw = fs.readFileSync(obsPath, 'utf-8').trim();
    if (!raw) return;

    // Parse observations
    const files: string[] = [];
    for (const line of raw.split('\n')) {
      try {
        const obs = JSON.parse(line);
        if (obs.file) files.push(obs.file);
      } catch { /* skip malformed lines */ }
    }

    // Extract co-occurrence: files edited in the same session
    if (files.length >= 2) {
      const { readBrain, saveBrain } = require('./project-brain.js');
      const brain = readBrain(projectDir);
      const unique = [...new Set(files)];

      // Record pairs as connections (deduplicate with existing)
      for (let i = 0; i < unique.length && i < 5; i++) {
        for (let j = i + 1; j < unique.length && j < 5; j++) {
          const conn = `${path.basename(unique[i])} ↔ ${path.basename(unique[j])}`;
          if (!brain.architecture.connections.includes(conn)) {
            brain.architecture.connections.push(conn);
          }
        }
      }

      // Keep connections bounded
      if (brain.architecture.connections.length > 20) {
        brain.architecture.connections = brain.architecture.connections.slice(-20);
      }

      saveBrain(projectDir, brain);
    }

    // Clear observations after consuming
    fs.writeFileSync(obsPath, '', 'utf-8');
  } catch { /* best-effort, never fail main operation */ }
}
