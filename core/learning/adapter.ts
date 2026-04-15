/**
 * core/learning/adapter.ts — Threshold Adaptive Module
 *
 * Reads thresholdSuggestions from learning/insights.json,
 * compares with current harness.json, and generates suggested changes.
 */
import fs from 'fs';
import path from 'path';
import { loadConfig } from '../state/config.js';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';

// Import analyzer types
import type { LearningInsights } from './analyzer.js';

export interface AdaptationChange {
  field: string;
  oldValue: number;
  newValue: number;
  reason: string;
}

export interface AdaptationResult {
  applied: boolean;
  changes: AdaptationChange[];
  requiresConfirmation: boolean;
}

function insightsPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'learning', 'insights.json');
}

function harnessPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'harness.json');
}

/**
 * Suggest threshold adaptations based on learning insights.
 * Does NOT write anything — just returns what would change.
 */
export function suggestAdaptations(projectDir: string): AdaptationResult {
  const { data: insights } = readJSON<LearningInsights>(insightsPath(projectDir));
  if (!insights || !insights.thresholdSuggestions) {
    return { applied: false, changes: [], requiresConfirmation: false };
  }

  const config = loadConfig(projectDir);
  const suggestions = insights.thresholdSuggestions;
  const changes: AdaptationChange[] = [];

  if (suggestions.codexMinSpecScore !== undefined &&
      suggestions.codexMinSpecScore !== config.routing.codexMinSpecScore) {
    changes.push({
      field: 'routing.codexMinSpecScore',
      oldValue: config.routing.codexMinSpecScore,
      newValue: suggestions.codexMinSpecScore,
      reason: insights.routingAccuracy?.['codexfake']?.rate !== undefined
        ? `Codexfake success rate: ${insights.routingAccuracy['codexfake'].rate}%`
        : 'Based on routing history',
    });
  }

  if (suggestions.codexMinIsolationScore !== undefined &&
      suggestions.codexMinIsolationScore !== config.routing.codexMinIsolationScore) {
    changes.push({
      field: 'routing.codexMinIsolationScore',
      oldValue: config.routing.codexMinIsolationScore,
      newValue: suggestions.codexMinIsolationScore,
      reason: 'Based on isolation score analysis',
    });
  }

  if (suggestions.confirmThreshold !== undefined &&
      suggestions.confirmThreshold !== config.routing.confirmThreshold) {
    changes.push({
      field: 'routing.confirmThreshold',
      oldValue: config.routing.confirmThreshold,
      newValue: suggestions.confirmThreshold,
      reason: 'Based on high-complexity task success rate',
    });
  }

  if (suggestions.highRiskThreshold !== undefined &&
      suggestions.highRiskThreshold !== config.recovery.highRiskThreshold) {
    changes.push({
      field: 'recovery.highRiskThreshold',
      oldValue: config.recovery.highRiskThreshold,
      newValue: suggestions.highRiskThreshold,
      reason: 'Mid-complexity (70-90) task failure rate analysis',
    });
  }

  return {
    applied: false,
    changes,
    requiresConfirmation: changes.length > 0,
  };
}

/**
 * Apply suggested adaptations to harness.json.
 * Merges changes into existing config (or creates new file).
 */
export function applyAdaptations(projectDir: string): AdaptationResult {
  const suggestion = suggestAdaptations(projectDir);
  if (suggestion.changes.length === 0) {
    return { applied: false, changes: [], requiresConfirmation: false };
  }

  // Read existing harness.json or start fresh
  const { data: existing } = readJSON<Record<string, unknown>>(harnessPath(projectDir));
  const config: Record<string, unknown> = existing || {};

  // Apply each change
  for (const change of suggestion.changes) {
    const parts = change.field.split('.');
    let target: Record<string, unknown> = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {};
      }
      target = target[parts[i]] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = change.newValue;
  }

  // Write back
  atomicWriteJSON(harnessPath(projectDir), config);

  return {
    applied: true,
    changes: suggestion.changes,
    requiresConfirmation: false,
  };
}

/**
 * Read learning history — list of past insights with timestamps.
 */
export function readLearningHistory(projectDir: string): { analyzedAt: string; taskStats: LearningInsights['taskStats']; suggestions: number }[] {
  const historyPath = path.join(projectDir, '.ham-autocode', 'learning', 'history.jsonl');
  try {
    const content = fs.readFileSync(historyPath, 'utf8');
    return content.trim().split('\n').filter(Boolean).map((line: string) => {
      const entry = JSON.parse(line) as { analyzedAt: string; taskStats: LearningInsights['taskStats']; thresholdSuggestions?: Record<string, unknown> };
      return {
        analyzedAt: entry.analyzedAt,
        taskStats: entry.taskStats,
        suggestions: Object.keys(entry.thresholdSuggestions || {}).length,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Append current insights to history.jsonl for trend tracking.
 */
export function appendToHistory(projectDir: string, insights: LearningInsights): void {
  const historyPath = path.join(projectDir, '.ham-autocode', 'learning', 'history.jsonl');
  const dir = path.dirname(historyPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(historyPath, JSON.stringify({
    analyzedAt: insights.analyzedAt,
    taskStats: insights.taskStats,
    routingAccuracy: insights.routingAccuracy,
    thresholdSuggestions: insights.thresholdSuggestions,
  }) + '\n');
}

/**
 * Reset all learning data.
 */
export function resetLearning(projectDir: string): { cleared: string[] } {
  const learningDir = path.join(projectDir, '.ham-autocode', 'learning');
  const cleared: string[] = [];
  if (fs.existsSync(learningDir)) {
    for (const file of fs.readdirSync(learningDir)) {
      const fp = path.join(learningDir, file);
      fs.unlinkSync(fp);
      cleared.push(file);
    }
  }
  return { cleared };
}
