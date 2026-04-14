/**
 * Field Test Feedback — lightweight finding recorder.
 * Records framework-level issues found during real project usage.
 */

import fs from 'fs';
import path from 'path';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';

export interface FieldTestEntry {
  id: string;
  project: string;
  timestamp: string;
  category: FieldTestCategory;
  severity: 'P0' | 'P1' | 'P2';
  description: string;
  status: 'open' | 'resolved';
}

export type FieldTestCategory = 'framework-gap' | 'config-issue' | 'ux-friction' | 'performance' | 'accuracy' | 'integration';

interface FieldTestLog {
  schemaVersion: number;
  entries: FieldTestEntry[];
  lastUpdated: string;
}

function logPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'learning', 'field-test-log.json');
}

export function readFieldTestLog(projectDir: string): FieldTestLog {
  const { data } = readJSON<FieldTestLog>(logPath(projectDir));
  return data || { schemaVersion: 1, entries: [], lastUpdated: new Date().toISOString() };
}

function saveLog(projectDir: string, log: FieldTestLog): void {
  const dir = path.dirname(logPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  log.lastUpdated = new Date().toISOString();
  atomicWriteJSON(logPath(projectDir), log);
}

export function recordFinding(
  projectDir: string,
  finding: { project: string; phase: string; category: FieldTestCategory; severity: 'P0' | 'P1' | 'P2'; description: string; context: string }
): FieldTestEntry {
  const log = readFieldTestLog(projectDir);
  const entry: FieldTestEntry = {
    id: `ft-${Date.now().toString(36)}`,
    project: finding.project,
    timestamp: new Date().toISOString(),
    category: finding.category,
    severity: finding.severity,
    description: finding.description,
    status: 'open',
  };
  log.entries.push(entry);
  saveLog(projectDir, log);
  return entry;
}

export function resolveFinding(projectDir: string, id: string, _resolution: string): FieldTestEntry | null {
  const log = readFieldTestLog(projectDir);
  const entry = log.entries.find(e => e.id === id);
  if (!entry) return null;
  entry.status = 'resolved';
  saveLog(projectDir, log);
  return entry;
}

/**
 * Auto-detect: only fires on repeated failures (same error 3+ times).
 */
export function autoDetectFindings(
  projectDir: string,
  ctx: { taskName: string; success: boolean; error?: string; files?: string[] }
): void {
  if (ctx.success || !ctx.error) return;
  const log = readFieldTestLog(projectDir);
  const errorSlice = ctx.error.slice(0, 50);
  const similar = log.entries.filter(e => e.status === 'open' && e.description.includes(errorSlice));
  if (similar.length >= 2) {
    recordFinding(projectDir, {
      project: path.basename(projectDir),
      phase: ctx.taskName,
      category: 'framework-gap',
      severity: 'P0',
      description: `Recurring failure (${similar.length + 1}x): ${ctx.error.slice(0, 100)}`,
      context: 'auto-detected',
    });
  }
}

export function fieldTestSummary(projectDir: string): string {
  const log = readFieldTestLog(projectDir);
  const open = log.entries.filter(e => e.status === 'open');
  if (open.length === 0) return `Field Test: ${log.entries.length} total, 0 open`;
  return `Field Test: ${log.entries.length} total, ${open.length} open\n` +
    open.slice(0, 5).map(e => `  ${e.id} [${e.severity}] ${e.description}`).join('\n');
}
