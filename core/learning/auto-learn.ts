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
import { indexProjectEntities } from './code-entities.js';
import { buildDependencyGraph } from './dependency-graph.js';
import { checkGuard } from './memory-guard.js';
import { autoDetectFindings } from './field-test.js';
import { readTask } from '../state/task-graph.js';
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

    // Memory Guard: check for problems after every task
    if (task) {
      const guardResult = checkGuard(projectDir, task.files || []);
      if (!guardResult.passed) {
        // Log guard issues to learning directory for visibility
        const guardLogPath = path.join(projectDir, '.ham-autocode', 'learning', 'guard-log.json');
        const dir = path.dirname(guardLogPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        atomicWriteJSON(guardLogPath, guardResult);
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

      // Update entity index and dependency graph periodically
      indexProjectEntities(projectDir);
      buildDependencyGraph(projectDir);

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
