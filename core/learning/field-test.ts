/**
 * Field Test Feedback Loop.
 * Records framework-level findings from real project usage,
 * categorizes them, and aggregates cross-project common issues
 * into improvement priorities.
 *
 * Triggered automatically by auto-learn when anomalies are detected,
 * or manually via CLI.
 */

import fs from 'fs';
import path from 'path';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';

// ─── Types ──────────────────────────────────────────────────────

export interface FieldTestEntry {
  id: string;
  project: string;
  phase: string;
  timestamp: string;
  category: FieldTestCategory;
  severity: 'P0' | 'P1' | 'P2';
  description: string;
  context: string;           // what was happening when this was found
  resolution?: string;       // how it was resolved (if at all)
  status: 'open' | 'resolved' | 'wontfix';
}

export type FieldTestCategory =
  | 'framework-gap'          // missing capability in ham-autocode
  | 'config-issue'           // configuration/setup problem
  | 'ux-friction'            // poor developer experience
  | 'performance'            // slow execution or resource issue
  | 'accuracy'               // wrong routing/estimation/analysis
  | 'integration';           // compatibility with external tools

export interface FieldTestLog {
  schemaVersion: number;
  entries: FieldTestEntry[];
  aggregated: AggregatedIssue[];
  lastUpdated: string;
}

export interface AggregatedIssue {
  pattern: string;
  category: FieldTestCategory;
  occurrences: number;
  projects: string[];
  suggestedPriority: 'P0' | 'P1' | 'P2';
  firstSeen: string;
  lastSeen: string;
}

// ─── Paths ──────────────────────────────────────────────────────

function logPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'learning', 'field-test-log.json');
}

// ─── Core Functions ─────────────────────────────────────────────

/**
 * Read existing field test log.
 */
export function readFieldTestLog(projectDir: string): FieldTestLog {
  const { data } = readJSON<FieldTestLog>(logPath(projectDir));
  return data || {
    schemaVersion: 1,
    entries: [],
    aggregated: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Save field test log.
 */
function saveLog(projectDir: string, log: FieldTestLog): void {
  const dir = path.dirname(logPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  log.lastUpdated = new Date().toISOString();
  atomicWriteJSON(logPath(projectDir), log);
}

/**
 * Record a field test finding.
 */
export function recordFinding(
  projectDir: string,
  finding: Omit<FieldTestEntry, 'id' | 'timestamp' | 'status'>
): FieldTestEntry {
  const log = readFieldTestLog(projectDir);

  const entry: FieldTestEntry = {
    ...finding,
    id: `ft-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    status: 'open',
  };

  log.entries.push(entry);
  aggregateIssues(log);
  saveLog(projectDir, log);

  return entry;
}

/**
 * Auto-detect findings from task execution context.
 * Called by auto-learn after task completion/failure.
 */
export function autoDetectFindings(
  projectDir: string,
  context: {
    taskName: string;
    success: boolean;
    duration?: number;
    error?: string;
    files?: string[];
  }
): FieldTestEntry[] {
  const findings: FieldTestEntry[] = [];
  const project = path.basename(projectDir);

  // Detect slow tasks (>5 minutes for non-complex work)
  if (context.duration && context.duration > 300000) {
    findings.push(recordFinding(projectDir, {
      project,
      phase: context.taskName,
      category: 'performance',
      severity: 'P1',
      description: `Task took ${Math.round(context.duration / 60000)}min — may indicate inefficiency`,
      context: `Task: ${context.taskName}, Duration: ${context.duration}ms`,
    }));
  }

  // Detect repeated failures on same error pattern
  if (!context.success && context.error) {
    const log = readFieldTestLog(projectDir);
    const similar = log.entries.filter(e =>
      e.status === 'open' &&
      e.description.includes(context.error!.slice(0, 50))
    );
    if (similar.length >= 2) {
      findings.push(recordFinding(projectDir, {
        project,
        phase: context.taskName,
        category: 'framework-gap',
        severity: 'P0',
        description: `Recurring failure (${similar.length + 1}x): ${context.error.slice(0, 100)}`,
        context: `Repeated error across tasks, suggesting a framework-level issue`,
      }));
    }
  }

  return findings;
}

/**
 * Resolve a finding.
 */
export function resolveFinding(
  projectDir: string,
  findingId: string,
  resolution: string
): FieldTestEntry | null {
  const log = readFieldTestLog(projectDir);
  const entry = log.entries.find(e => e.id === findingId);
  if (!entry) return null;

  entry.status = 'resolved';
  entry.resolution = resolution;
  aggregateIssues(log);
  saveLog(projectDir, log);

  return entry;
}

/**
 * Aggregate entries into cross-project patterns.
 */
function aggregateIssues(log: FieldTestLog): void {
  const patternMap = new Map<string, {
    category: FieldTestCategory;
    projects: Set<string>;
    count: number;
    firstSeen: string;
    lastSeen: string;
  }>();

  for (const entry of log.entries) {
    if (entry.status === 'wontfix') continue;

    // Create pattern key from category + simplified description
    const key = `${entry.category}:${entry.description.slice(0, 60)}`;
    const existing = patternMap.get(key);

    if (existing) {
      existing.count++;
      existing.projects.add(entry.project);
      if (entry.timestamp > existing.lastSeen) existing.lastSeen = entry.timestamp;
      if (entry.timestamp < existing.firstSeen) existing.firstSeen = entry.timestamp;
    } else {
      patternMap.set(key, {
        category: entry.category,
        projects: new Set([entry.project]),
        count: 1,
        firstSeen: entry.timestamp,
        lastSeen: entry.timestamp,
      });
    }
  }

  log.aggregated = Array.from(patternMap.entries())
    .map(([pattern, data]) => ({
      pattern,
      category: data.category,
      occurrences: data.count,
      projects: Array.from(data.projects),
      suggestedPriority: data.count >= 3 ? 'P0' as const :
                          data.count >= 2 ? 'P1' as const : 'P2' as const,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
    }))
    .sort((a, b) => {
      const order = { P0: 0, P1: 1, P2: 2 };
      return order[a.suggestedPriority] - order[b.suggestedPriority] || b.occurrences - a.occurrences;
    });
}

/**
 * Get summary of open field test issues.
 */
export function fieldTestSummary(projectDir: string): string {
  const log = readFieldTestLog(projectDir);
  const open = log.entries.filter(e => e.status === 'open');
  const resolved = log.entries.filter(e => e.status === 'resolved');

  const lines = [
    `Field Test Log: ${log.entries.length} total, ${open.length} open, ${resolved.length} resolved`,
  ];

  if (log.aggregated.length > 0) {
    lines.push('', 'Aggregated Patterns:');
    for (const agg of log.aggregated.slice(0, 10)) {
      lines.push(`  [${agg.suggestedPriority}] ${agg.pattern} (${agg.occurrences}x, ${agg.projects.length} project(s))`);
    }
  }

  if (open.length > 0) {
    lines.push('', 'Open Issues:');
    for (const entry of open.slice(0, 10)) {
      lines.push(`  ${entry.id} [${entry.severity}] ${entry.description}`);
    }
  }

  return lines.join('\n');
}
