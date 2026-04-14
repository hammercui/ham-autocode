/**
 * Uncommitted Code Analyzer.
 * Generates change summaries, risk assessments, and commit split suggestions
 * for uncommitted changes in a project.
 */

import { execFileSync } from 'child_process';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────

export interface UncommittedAnalysis {
  totalFiles: number;
  totalInsertions: number;
  totalDeletions: number;
  files: FileChange[];
  commitSuggestions: CommitSuggestion[];
  riskAssessment: RiskItem[];
  summary: string;
}

export interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  insertions: number;
  deletions: number;
  intent: string;        // inferred change intent
  category: ChangeCategory;
}

export type ChangeCategory = 'feat' | 'fix' | 'docs' | 'refactor' | 'test' | 'config' | 'style' | 'unknown';

export interface CommitSuggestion {
  files: string[];
  message: string;
  category: ChangeCategory;
  order: number;
}

export interface RiskItem {
  file: string;
  risk: 'high' | 'medium' | 'low';
  reason: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function safeGit(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e: unknown) {
    return (e as { stdout?: string }).stdout || '';
  }
}

/**
 * Infer change category from file path and diff content.
 */
function inferCategory(filePath: string, diffContent: string): ChangeCategory {
  const lowerPath = filePath.toLowerCase();

  // Tests
  if (lowerPath.includes('test') || lowerPath.includes('spec') || lowerPath.includes('__tests__')) {
    return 'test';
  }
  // Docs
  if (lowerPath.endsWith('.md') || lowerPath.includes('/docs/')) {
    return 'docs';
  }
  // Config
  if (/\.(json|yaml|yml|toml|ini|env)$/.test(lowerPath) ||
      lowerPath.includes('config') || lowerPath.includes('tsconfig') ||
      lowerPath.includes('.eslint') || lowerPath.includes('.prettier')) {
    return 'config';
  }
  // Style
  if (/\.(css|scss|less|sass)$/.test(lowerPath)) {
    return 'style';
  }

  // Infer from diff content
  if (diffContent.includes('fix') || diffContent.includes('bug') || diffContent.includes('error')) {
    return 'fix';
  }

  // Default to feat for source code changes
  if (/\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(lowerPath)) {
    return 'feat';
  }

  return 'unknown';
}

/**
 * Infer change intent from diff content.
 */
function inferIntent(filePath: string, diffContent: string): string {
  const fileName = path.basename(filePath);
  const lines = diffContent.split('\n');
  const addedLines = lines.filter(l => l.startsWith('+')).map(l => l.slice(1).trim());
  const removedLines = lines.filter(l => l.startsWith('-')).map(l => l.slice(1).trim());

  // Detect new file
  if (removedLines.length === 0 && addedLines.length > 0) {
    return `New file: ${fileName}`;
  }

  // Detect deletion
  if (addedLines.length === 0 && removedLines.length > 0) {
    return `Removed: ${fileName}`;
  }

  // Detect function additions
  const newFunctions = addedLines.filter(l =>
    /^(export\s+)?(async\s+)?function\s+\w+/.test(l) ||
    /^(export\s+)?(const|let)\s+\w+\s*=\s*(async\s+)?\(/.test(l)
  );
  if (newFunctions.length > 0) {
    return `Added ${newFunctions.length} function(s) in ${fileName}`;
  }

  // Detect import changes
  const newImports = addedLines.filter(l => /^import\s+/.test(l));
  if (newImports.length > addedLines.length * 0.5 && newImports.length > 0) {
    return `Updated imports in ${fileName}`;
  }

  // Generic
  const ratio = addedLines.length / Math.max(1, removedLines.length);
  if (ratio > 3) return `Extended ${fileName} (+${addedLines.length} lines)`;
  if (ratio < 0.3) return `Trimmed ${fileName} (-${removedLines.length} lines)`;
  return `Modified ${fileName} (+${addedLines.length}/-${removedLines.length})`;
}

/**
 * Assess risk of a file change.
 */
function assessRisk(filePath: string, insertions: number, deletions: number): RiskItem | null {
  const risks: RiskItem[] = [];
  const lowerPath = filePath.toLowerCase();

  // High risk: large changes
  if (insertions + deletions > 200) {
    risks.push({ file: filePath, risk: 'high', reason: `Large change: +${insertions}/-${deletions} lines` });
  }

  // High risk: core/config files
  if (lowerPath.includes('package.json') || lowerPath.includes('tsconfig') ||
      lowerPath.includes('.env') || lowerPath.includes('docker')) {
    risks.push({ file: filePath, risk: 'high', reason: 'Configuration file change' });
  }

  // Medium risk: migration/schema files
  if (lowerPath.includes('migration') || lowerPath.includes('schema') ||
      lowerPath.includes('database')) {
    risks.push({ file: filePath, risk: 'medium', reason: 'Database/schema file change' });
  }

  // Medium risk: auth/security
  if (lowerPath.includes('auth') || lowerPath.includes('security') ||
      lowerPath.includes('crypto') || lowerPath.includes('permission')) {
    risks.push({ file: filePath, risk: 'medium', reason: 'Security-related file change' });
  }

  return risks.length > 0 ? risks.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.risk] - order[b.risk];
  })[0] : null;
}

// ─── Main Entry ─────────────────────────────────────────────────

/**
 * Analyze uncommitted changes in a project.
 */
export function analyzeUncommitted(projectDir: string): UncommittedAnalysis {
  // Get file-level stats
  const statusOutput = safeGit(['status', '--porcelain'], projectDir);

  if (!statusOutput.trim()) {
    return {
      totalFiles: 0,
      totalInsertions: 0,
      totalDeletions: 0,
      files: [],
      commitSuggestions: [],
      riskAssessment: [],
      summary: 'Working tree clean — no uncommitted changes',
    };
  }

  // Parse status
  const statusLines = statusOutput.trim().split('\n');
  const files: FileChange[] = [];
  let totalIns = 0;
  let totalDel = 0;

  for (const line of statusLines) {
    const statusCode = line.substring(0, 2).trim();
    const filePath = line.substring(3).trim();

    // Get diff for this file
    let diff = '';
    try {
      diff = safeGit(['diff', 'HEAD', '--', filePath], projectDir);
      if (!diff) {
        // Might be untracked
        diff = safeGit(['diff', '--no-index', '/dev/null', filePath], projectDir);
      }
    } catch { /* ignore */ }

    // Count insertions/deletions
    const insertions = (diff.match(/^\+[^+]/gm) || []).length;
    const deletions = (diff.match(/^-[^-]/gm) || []).length;
    totalIns += insertions;
    totalDel += deletions;

    const status: FileChange['status'] =
      statusCode.includes('?') ? 'added' :
      statusCode.includes('D') ? 'deleted' :
      statusCode.includes('R') ? 'renamed' : 'modified';

    const category = inferCategory(filePath, diff);
    const intent = inferIntent(filePath, diff);

    files.push({ path: filePath, status, insertions, deletions, intent, category });
  }

  // Group files by category for commit suggestions
  const groups = new Map<ChangeCategory, FileChange[]>();
  for (const file of files) {
    const existing = groups.get(file.category) || [];
    existing.push(file);
    groups.set(file.category, existing);
  }

  const commitSuggestions: CommitSuggestion[] = [];
  const categoryOrder: ChangeCategory[] = ['fix', 'feat', 'refactor', 'test', 'docs', 'config', 'style', 'unknown'];
  let order = 1;

  for (const cat of categoryOrder) {
    const group = groups.get(cat);
    if (!group || group.length === 0) continue;

    // Further split large groups by directory
    const byDir = new Map<string, FileChange[]>();
    for (const f of group) {
      const dir = path.dirname(f.path);
      const existing = byDir.get(dir) || [];
      existing.push(f);
      byDir.set(dir, existing);
    }

    for (const [dir, dirFiles] of byDir) {
      const scope = dir === '.' ? '' : `(${path.basename(dir)})`;
      const intents = dirFiles.map(f => f.intent).join('; ');
      commitSuggestions.push({
        files: dirFiles.map(f => f.path),
        message: `${cat}${scope}: ${intents}`,
        category: cat,
        order: order++,
      });
    }
  }

  // Risk assessment
  const riskAssessment: RiskItem[] = [];
  for (const file of files) {
    const risk = assessRisk(file.path, file.insertions, file.deletions);
    if (risk) riskAssessment.push(risk);
  }
  riskAssessment.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.risk] - order[b.risk];
  });

  // Summary
  const summaryLines = [
    `Uncommitted Changes: ${files.length} files, +${totalIns}/-${totalDel} lines`,
    '',
    'Files:',
    ...files.map(f => `  ${f.status.padEnd(8)} ${f.path} — ${f.intent}`),
  ];

  if (commitSuggestions.length > 1) {
    summaryLines.push('', `Suggested Commits (${commitSuggestions.length}):`);
    for (const s of commitSuggestions) {
      summaryLines.push(`  ${s.order}. ${s.message} [${s.files.length} files]`);
    }
  }

  if (riskAssessment.length > 0) {
    summaryLines.push('', 'Risks:');
    for (const r of riskAssessment) {
      summaryLines.push(`  [${r.risk.toUpperCase()}] ${r.file}: ${r.reason}`);
    }
  }

  return {
    totalFiles: files.length,
    totalInsertions: totalIns,
    totalDeletions: totalDel,
    files,
    commitSuggestions,
    riskAssessment,
    summary: summaryLines.join('\n'),
  };
}
