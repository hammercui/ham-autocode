/**
 * Project Brain — evolving project understanding that compounds with every task.
 *
 * Unlike threshold adaptation (mechanical), this captures semantic understanding:
 * - Architecture: what's where, how things connect
 * - Conventions: naming patterns, file organization, code style
 * - Domain: business terms, user flows, key abstractions
 * - Pain points: files that cause trouble, tricky areas
 * - Proven patterns: approaches that worked in this project
 *
 * The brain grows after every task completion and is consumed by:
 * - execute prepare: better task context
 * - spec enrich: smarter heuristics
 * - route: informed scoring
 * - skills: injected project understanding
 */

import fs from 'fs';
import path from 'path';
import { readJSON, atomicWriteJSON } from '../state/atomic.js';
import type { TaskState } from '../types.js';

export interface ProjectBrain {
  schemaVersion: number;
  updatedAt: string;
  evolvedFrom: number; // how many task completions shaped this brain

  /** High-level architecture understanding */
  architecture: {
    summary: string;
    keyModules: { name: string; path: string; role: string }[];
    connections: string[]; // "A depends on B for X"
  };

  /** Code conventions observed */
  conventions: {
    language: string;
    fileNaming: string;     // e.g., "kebab-case.ts"
    importStyle: string;    // e.g., "ESM with .js extension"
    testPattern: string;    // e.g., "__tests__/*.test.ts"
    otherPatterns: string[];
  };

  /** Domain knowledge accumulated */
  domain: {
    terms: { term: string; meaning: string }[];
    userFlows: string[];
  };

  /** Files/areas that caused trouble */
  painPoints: {
    file: string;
    issue: string;
    learnedAt: string;
  }[];

  /** Approaches that worked */
  provenPatterns: {
    pattern: string;
    context: string;
    learnedAt: string;
  }[];

  /** Raw evolution log — what was learned from each task */
  evolutionLog: {
    taskId: string;
    taskName: string;
    learnedAt: string;
    insight: string;
  }[];
}

function brainPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'learning', 'project-brain.json');
}

/**
 * Read the current project brain (or create empty one).
 */
export function readBrain(projectDir: string): ProjectBrain {
  const { data } = readJSON<ProjectBrain>(brainPath(projectDir));
  if (data) return data;

  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    evolvedFrom: 0,
    architecture: { summary: '', keyModules: [], connections: [] },
    conventions: { language: '', fileNaming: '', importStyle: '', testPattern: '', otherPatterns: [] },
    domain: { terms: [], userFlows: [] },
    painPoints: [],
    provenPatterns: [],
    evolutionLog: [],
  };
}

function saveBrain(projectDir: string, brain: ProjectBrain): void {
  const dir = path.dirname(brainPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  brain.updatedAt = new Date().toISOString();
  atomicWriteJSON(brainPath(projectDir), brain);
}

/**
 * Evolve the brain after a task completes.
 * Extracts structural insights from the task and its files.
 */
export function evolveFromTask(projectDir: string, task: TaskState): void {
  const brain = readBrain(projectDir);
  brain.evolvedFrom++;

  // 1. Learn architecture from task files
  for (const file of task.files || []) {
    const dir = path.dirname(file);
    const ext = path.extname(file);
    const baseName = path.basename(file, ext);

    // Discover key modules — v3.4: read file header for real description
    const existingModule = brain.architecture.keyModules.find(m => m.path === dir);
    if (dir !== '.' && dir !== '') {
      let role = '';
      // Try reading the file's JSDoc/header comment (first 30 lines)
      const fullPath = path.resolve(projectDir, file);
      try {
        if (fs.existsSync(fullPath)) {
          const head = fs.readFileSync(fullPath, 'utf8').split('\n').slice(0, 30).join('\n');
          const docMatch = head.match(/\/\*\*\s*([\s\S]*?)\*\//);
          if (docMatch) {
            role = docMatch[1].replace(/\s*\*\s*/g, ' ').trim().slice(0, 100);
          }
        }
      } catch { /* skip unreadable */ }
      // Fallback to heuristic
      if (!role) role = inferModuleRole(dir, baseName, task.name);

      if (role) {
        if (existingModule) {
          // Update with better description if we got a real one from code
          if (role.length > existingModule.role.length) existingModule.role = role;
        } else {
          brain.architecture.keyModules.push({ name: path.basename(dir), path: dir, role });
        }
      }
    }

    // Learn conventions from file patterns
    if (!brain.conventions.language && ext) {
      brain.conventions.language = extToLanguage(ext);
    }
    if (!brain.conventions.fileNaming && baseName.includes('-')) {
      brain.conventions.fileNaming = 'kebab-case' + ext;
    } else if (!brain.conventions.fileNaming && baseName.includes('_')) {
      brain.conventions.fileNaming = 'snake_case' + ext;
    } else if (!brain.conventions.fileNaming && /[A-Z]/.test(baseName[0] || '')) {
      brain.conventions.fileNaming = 'PascalCase' + ext;
    }

    // Detect test patterns
    if ((file.includes('test') || file.includes('__tests__')) && !brain.conventions.testPattern) {
      if (file.includes('__tests__')) brain.conventions.testPattern = '__tests__/*.test' + ext;
      else if (file.includes('.test.')) brain.conventions.testPattern = '*.test' + ext;
      else if (file.includes('.spec.')) brain.conventions.testPattern = '*.spec' + ext;
    }
  }

  // 2. Learn from task outcome
  if (task.status === 'failed') {
    const issue = task.execution?.error || task.execution?.errorType || 'unknown failure';
    for (const file of task.files || []) {
      // Only add if not already tracked
      if (!brain.painPoints.some(p => p.file === file && p.issue === issue)) {
        brain.painPoints.push({
          file,
          issue: `Failed during "${task.name}": ${issue}`,
          learnedAt: new Date().toISOString(),
        });
      }
    }
  }

  if (task.status === 'done') {
    // Record successful pattern
    const patternDesc = describeTaskPattern(task);
    if (patternDesc && !brain.provenPatterns.some(p => p.pattern === patternDesc)) {
      brain.provenPatterns.push({
        pattern: patternDesc,
        context: task.name,
        learnedAt: new Date().toISOString(),
      });
    }
  }

  // 3. Learn domain terms from task names
  const domainTerms = extractDomainTerms(task.name);
  for (const term of domainTerms) {
    if (!brain.domain.terms.some(t => t.term === term.term)) {
      brain.domain.terms.push(term);
    }
  }

  // 4. Record evolution log entry
  const insight = generateInsight(task, brain);
  brain.evolutionLog.push({
    taskId: task.id,
    taskName: task.name,
    learnedAt: new Date().toISOString(),
    insight,
  });

  // v3.4: Memory decay — age-based cleanup
  // Increment age on all entries, remove stale ones
  const MAX_AGE = 30;  // tasks since creation
  for (const pp of brain.painPoints) { (pp as any).age = ((pp as any).age || 0) + 1; }
  brain.painPoints = brain.painPoints.filter(pp => ((pp as any).age || 0) < MAX_AGE);

  for (const pp of brain.provenPatterns) { (pp as any).age = ((pp as any).age || 0) + 1; }
  brain.provenPatterns = brain.provenPatterns.filter(pp => ((pp as any).age || 0) < MAX_AGE);

  // v3.5: Keep evolution log bounded (30, more info per entry)
  if (brain.evolutionLog.length > 30) {
    brain.evolutionLog = brain.evolutionLog.slice(-30);
  }

  // Keep domain terms bounded
  if (brain.domain.terms.length > 30) {
    brain.domain.terms = brain.domain.terms.slice(-30);
  }

  saveBrain(projectDir, brain);
}

/**
 * Evolve the brain from a project scan (called by detect skill).
 */
export function evolveFromScan(projectDir: string): void {
  const brain = readBrain(projectDir);

  // Scan project structure for architecture understanding
  const scanDir = (dir: string, depth: number): void => {
    if (depth > 3) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') &&
            entry.name !== 'node_modules' && entry.name !== 'dist') {
          const relDir = path.relative(projectDir, path.join(dir, entry.name)).replace(/\\/g, '/');
          if (!brain.architecture.keyModules.some(m => m.path === relDir)) {
            const role = inferModuleRole(relDir, entry.name, '');
            if (role) {
              brain.architecture.keyModules.push({ name: entry.name, path: relDir, role });
            }
          }
          scanDir(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch { /* ignore */ }
  };
  scanDir(projectDir, 0);

  // Detect import style from a sample file
  if (!brain.conventions.importStyle) {
    const tsFiles = findFiles(projectDir, '.ts', 3);
    for (const file of tsFiles.slice(0, 3)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes("from '")) brain.conventions.importStyle = 'ESM single-quote';
        else if (content.includes('from "')) brain.conventions.importStyle = 'ESM double-quote';
        else if (content.includes('require(')) brain.conventions.importStyle = 'CommonJS require';
        if (brain.conventions.importStyle) break;
      } catch { /* ignore */ }
    }
  }

  // Build architecture summary
  if (brain.architecture.keyModules.length > 0 && !brain.architecture.summary) {
    const moduleList = brain.architecture.keyModules
      .map(m => `${m.name} (${m.role})`)
      .slice(0, 10)
      .join(', ');
    brain.architecture.summary = `Project has ${brain.architecture.keyModules.length} key modules: ${moduleList}`;
  }

  saveBrain(projectDir, brain);
}

/**
 * Get a COMPACT context index for a task (~150 tokens).
 * Progressive disclosure Layer 1: summary stats only.
 * Agent can call `learn detail <topic>` for full details.
 */
export function getBrainContext(projectDir: string, taskName: string): string {
  const brain = readBrain(projectDir);
  if (brain.evolvedFrom === 0 && brain.architecture.keyModules.length === 0) return '';

  const lines: string[] = ['## Project Understanding (auto-evolved)'];

  if (brain.architecture.summary) {
    lines.push(`Architecture: ${brain.architecture.summary}`);
  }

  if (brain.conventions.language) {
    lines.push(`Conventions: ${brain.conventions.language}, ${brain.conventions.fileNaming || 'default'}, tests: ${brain.conventions.testPattern || '?'}`);
  }

  // Compact stats instead of full lists
  const painCount = brain.painPoints.length;
  const patternCount = brain.provenPatterns.length;
  const termCount = brain.domain.terms.length;

  if (painCount > 0 || patternCount > 0) {
    lines.push(`Memory: ${painCount} pain points, ${patternCount} proven patterns, ${termCount} domain terms`);
  }

  // Only show the single most relevant pain point (if any)
  const nameLower = taskName.toLowerCase();
  const topPain = brain.painPoints.find(p =>
    nameLower.includes(path.basename(p.file, path.extname(p.file)).toLowerCase())
  );
  if (topPain) {
    lines.push(`⚠️ ${topPain.file}: ${topPain.issue}`);
  }

  lines.push(`(${brain.evolvedFrom} tasks | detail: ham-cli learn detail <pain|pattern|domain|history>)`);

  return lines.join('\n');
}

/**
 * Progressive disclosure Layer 2: full details for a topic.
 * Called via `learn detail <topic>` CLI command.
 */
export function getBrainDetail(projectDir: string, topic: string): string {
  const brain = readBrain(projectDir);

  if (topic === 'pain' || topic === 'all') {
    if (brain.painPoints.length === 0) return 'No pain points recorded.';
    const lines = ['## Pain Points (files that caused failures)'];
    for (const p of brain.painPoints) {
      lines.push(`- ${p.file}: ${p.issue} (learned: ${p.learnedAt.slice(0, 10)})`);
    }
    if (topic === 'pain') return lines.join('\n');
  }

  if (topic === 'pattern' || topic === 'all') {
    if (brain.provenPatterns.length === 0 && topic === 'pattern') return 'No proven patterns recorded.';
    const lines = topic === 'all' ? ['', '## Proven Patterns'] : ['## Proven Patterns'];
    for (const p of brain.provenPatterns) {
      lines.push(`- ${p.pattern} (context: ${p.context})`);
    }
    if (topic === 'pattern') return lines.join('\n');
  }

  if (topic === 'domain' || topic === 'all') {
    if (brain.domain.terms.length === 0 && topic === 'domain') return 'No domain terms recorded.';
    const lines = topic === 'all' ? ['', '## Domain Terms'] : ['## Domain Terms'];
    for (const t of brain.domain.terms) {
      lines.push(`- **${t.term}**: ${t.meaning}`);
    }
    if (topic === 'domain') return lines.join('\n');
  }

  if (topic === 'history' || topic === 'all') {
    if (brain.evolutionLog.length === 0 && topic === 'history') return 'No evolution history.';
    const lines = topic === 'all' ? ['', '## Evolution History (recent)'] : ['## Evolution History (recent)'];
    for (const e of brain.evolutionLog.slice(-15)) {
      lines.push(`- [${e.learnedAt.slice(0, 10)}] ${e.taskName}: ${e.insight}`);
    }
    if (topic === 'history') return lines.join('\n');
  }

  if (topic === 'all') {
    // Combine all sections built above
    const sections: string[] = [];
    for (const t of ['pain', 'pattern', 'domain', 'history'] as const) {
      const detail = getBrainDetail(projectDir, t);
      if (!detail.startsWith('No ')) sections.push(detail);
    }
    return sections.join('\n\n');
  }

  return `Unknown topic: ${topic}. Supported: pain, pattern, domain, history, all`;
}

// ─── Helper functions ───────────────────────────

function inferModuleRole(dirPath: string, name: string, taskName: string): string {
  const lower = (dirPath + '/' + name + '/' + taskName).toLowerCase();
  if (lower.includes('api') || lower.includes('routes') || lower.includes('endpoint')) return 'API layer';
  if (lower.includes('component') || lower.includes('renderer') || lower.includes('pages') || lower.includes('views')) return 'UI layer';
  if (lower.includes('provider') || lower.includes('adapter') || lower.includes('service')) return 'Service layer';
  if (lower.includes('model') || lower.includes('schema') || lower.includes('db') || lower.includes('migration')) return 'Data layer';
  if (lower.includes('util') || lower.includes('helper') || lower.includes('lib') || lower.includes('common')) return 'Utility';
  if (lower.includes('test') || lower.includes('__tests__') || lower.includes('spec')) return 'Test';
  if (lower.includes('config') || lower.includes('setting')) return 'Configuration';
  if (lower.includes('hook') || lower.includes('middleware')) return 'Middleware';
  if (lower.includes('stage') || lower.includes('pipeline') || lower.includes('orchestr')) return 'Orchestration';
  if (lower.includes('electron') || lower.includes('main') || lower.includes('preload')) return 'Desktop shell';
  if (lower.includes('script') || lower.includes('bin') || lower.includes('cli')) return 'CLI/Scripts';
  if (lower.includes('doc') || lower.includes('asset') || lower.includes('static')) return 'Documentation/Assets';
  return '';
}

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript + React', '.js': 'JavaScript', '.jsx': 'JavaScript + React',
    '.py': 'Python', '.rb': 'Ruby', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin',
  };
  return map[ext] || ext;
}

function describeTaskPattern(task: TaskState): string {
  const files = task.files || [];
  if (files.length === 0) return '';

  const exts = [...new Set(files.map(f => path.extname(f)))];
  const dirs = [...new Set(files.map(f => path.dirname(f)))];

  if (files.some(f => f.includes('test')) && files.some(f => !f.includes('test'))) {
    return `TDD: implementation + tests in same task (${dirs.join(', ')})`;
  }
  if (dirs.length === 1) {
    return `Single-module change in ${dirs[0]} (${files.length} files, ${exts.join('/')})`;
  }
  if (dirs.length > 3) {
    return `Cross-cutting change across ${dirs.length} directories`;
  }
  return '';
}

function extractDomainTerms(taskName: string): { term: string; meaning: string }[] {
  const terms: { term: string; meaning: string }[] = [];
  // Extract capitalized multi-word terms or Chinese terms
  const patterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,  // "User Authentication"
    /([\u4e00-\u9fff]{2,})/g,                    // Chinese terms
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(taskName)) !== null) {
      const term = match[1];
      if (term.length > 1 && !terms.some(t => t.term === term)) {
        terms.push({ term, meaning: `Referenced in: ${taskName}` });
      }
    }
  }
  return terms;
}

/**
 * v3.5: Generate a structured natural language summary for the evolution log.
 * Format: "[date] type: description (files, N files, outcome)"
 * Designed to be directly understandable by agents without format parsing.
 */
function generateInsight(task: TaskState, _brain: ProjectBrain): string {
  const files = task.files || [];
  const date = new Date().toISOString().slice(0, 10);
  const dirs = [...new Set(files.map(f => path.dirname(f)))];
  const type = inferTaskType(task.name);

  if (task.status === 'done' && files.length > 0) {
    const scope = dirs.length === 1 ? dirs[0] : `${dirs.length} dirs`;
    return `[${date}] ${type}: ${task.name} (${files.length} files in ${scope}, success)`;
  }
  if (task.status === 'failed') {
    const err = task.execution?.errorType || task.execution?.error || 'unknown';
    return `[${date}] ${type}: ${task.name} FAILED — ${err}`;
  }
  return `[${date}] ${type}: ${task.name} → ${task.status}`;
}

function inferTaskType(taskName: string): string {
  const lower = taskName.toLowerCase();
  if (lower.includes('fix') || lower.includes('bug')) return 'fix';
  if (lower.includes('test')) return 'test';
  if (lower.includes('doc') || lower.includes('readme')) return 'doc';
  if (lower.includes('refactor') || lower.includes('clean')) return 'refactor';
  if (lower.includes('config') || lower.includes('setup')) return 'config';
  return 'feat';
}

function findFiles(dir: string, ext: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(ext)) results.push(full);
      else if (entry.isDirectory()) results.push(...findFiles(full, ext, maxDepth, depth + 1));
    }
  } catch { /* ignore */ }
  return results;
}
