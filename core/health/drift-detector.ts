/**
 * Document-Code Drift Detector.
 * Scans TODO/backlog markdown files and cross-references with code
 * to find status mismatches (marked "pending" but actually fixed, etc.).
 *
 * Designed for Chinese and English TODO documents.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// ─── Types ──────────────────────────────────────────────────────

export interface DriftReport {
  scannedFiles: string[];
  drifts: DriftItem[];
  summary: string;
  driftCount: number;
}

export interface DriftItem {
  file: string;
  line: number;
  issue: string;
  docStatus: string;
  codeEvidence: string;
  suggestion: string;
  type: 'fixed-but-pending' | 'regressed' | 'stale-reference';
}

// ─── Status Keywords ────────────────────────────────────────────

const PENDING_PATTERNS = [
  /待修复/,
  /待开发/,
  /待完善/,
  /待验证/,
  /TODO/i,
  /FIXME/i,
  /pending/i,
  /not\s+done/i,
  /not\s+fixed/i,
  /未完成/,
  /未修复/,
];

const DONE_PATTERNS = [
  /已修复/,
  /已完成/,
  /已实现/,
  /done/i,
  /fixed/i,
  /completed/i,
  /resolved/i,
];

// ─── Helpers ────────────────────────────────────────────────────

function findTodoFiles(projectDir: string): string[] {
  const candidates: string[] = [];

  // Search common locations for todo/backlog docs
  const searchDirs = [projectDir, path.join(projectDir, 'docs')];
  const patterns = [
    /todo/i, /backlog/i, /待办/i, /roadmap/i,
    /changelog/i, /issues/i,
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      if (patterns.some(p => p.test(file))) {
        candidates.push(path.join(dir, file));
      }
    }
  }

  return candidates;
}

/**
 * Extract keywords from an issue description for code searching.
 * e.g., "Gemini API Key URL 泄露" → ["Gemini", "API", "Key", "URL"]
 */
function extractSearchTerms(issue: string): string[] {
  // Remove common noise words
  const noise = new Set([
    '的', '了', '是', '在', '有', '和', '与', '或', '从', '到',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in',
    'for', 'and', 'or', 'but', 'on', 'at', 'by', 'with', 'not',
  ]);

  return issue
    .replace(/[|—\-\(\)（）\[\]]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !noise.has(w.toLowerCase()))
    .slice(0, 5);  // limit search terms
}

/**
 * Search codebase for evidence that an issue is addressed.
 * Returns true if code evidence suggests the issue is fixed.
 */
function searchCodeEvidence(projectDir: string, terms: string[]): { found: boolean; evidence: string } {
  if (terms.length === 0) return { found: false, evidence: 'No search terms extracted' };

  // Try grep for each term, looking for patterns that suggest fixes
  for (const term of terms) {
    try {
      const output = execFileSync('git', [
        'log', '--oneline', '--all', '-10',
        `--grep=${term}`,
      ], {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (output.trim()) {
        const commits = output.trim().split('\n');
        const fixCommits = commits.filter(c =>
          /fix|修复|resolve|complete|完成/.test(c.toLowerCase())
        );
        if (fixCommits.length > 0) {
          return { found: true, evidence: `Git: ${fixCommits[0]}` };
        }
      }
    } catch { /* ignore */ }
  }

  // Fallback: grep source code for the term (catches implemented but uncommitted features)
  for (const term of terms) {
    if (term.length < 4) continue;  // skip short terms to avoid noise
    try {
      const output = execFileSync('git', [
        'grep', '-li', term, '--', '*.ts', '*.tsx', '*.js', '*.jsx',
      ], {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (output.trim()) {
        const files = output.trim().split('\n');
        return { found: true, evidence: `Code: "${term}" found in ${files[0]} (+${files.length - 1} more)` };
      }
    } catch { /* ignore */ }
  }

  return { found: false, evidence: 'No fix evidence in git history or code' };
}

// ─── Core Detection ─────────────────────────────────────────────

interface TableRow {
  line: number;
  issue: string;
  status: string;
  rawLine: string;
}

/**
 * Parse markdown table rows for issue-status pairs.
 * Supports: | issue | status | and | issue | ... | status |
 */
function parseTableRows(content: string): TableRow[] {
  const rows: TableRow[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip header separator
    if (/^\|[\s\-:]+\|/.test(line)) continue;
    // Skip non-table lines
    if (!line.startsWith('|')) continue;

    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length < 2) continue;

    // The last cell is typically the status
    const status = cells[cells.length - 1];
    const issue = cells[0];

    // Check if this looks like a status cell
    const isPending = PENDING_PATTERNS.some(p => p.test(status));
    const isDone = DONE_PATTERNS.some(p => p.test(status));

    if (isPending || isDone) {
      rows.push({
        line: i + 1,
        issue,
        status,
        rawLine: line,
      });
    }
  }

  return rows;
}

/**
 * Detect drift for a single file.
 */
function detectDriftsInFile(projectDir: string, filePath: string): DriftItem[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseTableRows(content);
  const drifts: DriftItem[] = [];
  const relPath = path.relative(projectDir, filePath);

  for (const row of rows) {
    const isPending = PENDING_PATTERNS.some(p => p.test(row.status));
    const isDone = DONE_PATTERNS.some(p => p.test(row.status));
    const terms = extractSearchTerms(row.issue);

    if (isPending) {
      // Check if code evidence suggests it's actually fixed
      const evidence = searchCodeEvidence(projectDir, terms);
      if (evidence.found) {
        drifts.push({
          file: relPath,
          line: row.line,
          issue: row.issue,
          docStatus: row.status,
          codeEvidence: evidence.evidence,
          suggestion: `Update status to "已修复" — ${evidence.evidence}`,
          type: 'fixed-but-pending',
        });
      }
    } else if (isDone) {
      // TODO: optionally check for regressions (harder, requires deeper code analysis)
      // For now, skip done items unless we add regression detection
    }
  }

  return drifts;
}

// ─── Main Entry ─────────────────────────────────────────────────

/**
 * Scan project for document-code drift.
 * Finds TODO/backlog files and cross-references with code/git.
 */
export function detectDrift(projectDir: string): DriftReport {
  const files = findTodoFiles(projectDir);
  const allDrifts: DriftItem[] = [];

  for (const file of files) {
    const drifts = detectDriftsInFile(projectDir, file);
    allDrifts.push(...drifts);
  }

  const summary = allDrifts.length === 0
    ? `Scanned ${files.length} doc files — no drift detected`
    : `Scanned ${files.length} doc files — ${allDrifts.length} drift(s) found:\n` +
      allDrifts.map(d =>
        `  [${d.type}] ${d.file}:${d.line} "${d.issue}" (doc: ${d.docStatus}, code: ${d.codeEvidence})`
      ).join('\n');

  return {
    scannedFiles: files.map(f => path.relative(projectDir, f)),
    drifts: allDrifts,
    summary,
    driftCount: allDrifts.length,
  };
}
