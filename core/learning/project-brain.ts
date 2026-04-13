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

    // Discover key modules
    const existingModule = brain.architecture.keyModules.find(m => m.path === dir);
    if (!existingModule && dir !== '.' && dir !== '') {
      // Infer role from directory name and file content
      const role = inferModuleRole(dir, baseName, task.name);
      if (role) {
        brain.architecture.keyModules.push({ name: path.basename(dir), path: dir, role });
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

  // Keep evolution log bounded (last 100 entries)
  if (brain.evolutionLog.length > 100) {
    brain.evolutionLog = brain.evolutionLog.slice(-100);
  }

  // Keep pain points bounded (last 50)
  if (brain.painPoints.length > 50) {
    brain.painPoints = brain.painPoints.slice(-50);
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
 * Get a context prompt for a task, informed by the project brain.
 * Used by execute prepare and spec enrich.
 */
export function getBrainContext(projectDir: string, taskName: string): string {
  const brain = readBrain(projectDir);
  if (brain.evolvedFrom === 0 && brain.architecture.keyModules.length === 0) return '';

  const lines: string[] = ['## Project Understanding (auto-evolved)'];

  if (brain.architecture.summary) {
    lines.push(`\nArchitecture: ${brain.architecture.summary}`);
  }

  if (brain.conventions.language) {
    lines.push(`\nConventions: ${brain.conventions.language}, ${brain.conventions.fileNaming || 'default naming'}, ${brain.conventions.importStyle || ''}, tests: ${brain.conventions.testPattern || 'unknown'}`);
  }

  // Find relevant pain points
  const nameLower = taskName.toLowerCase();
  const relevantPains = brain.painPoints.filter(p =>
    nameLower.includes(path.basename(p.file, path.extname(p.file)).toLowerCase())
  );
  if (relevantPains.length > 0) {
    lines.push('\nKnown issues in related files:');
    for (const p of relevantPains.slice(0, 3)) {
      lines.push(`  ⚠️ ${p.file}: ${p.issue}`);
    }
  }

  // Find relevant proven patterns
  const relevantPatterns = brain.provenPatterns.filter(p =>
    nameLower.includes(p.context.toLowerCase().slice(0, 15))
  );
  if (relevantPatterns.length > 0) {
    lines.push('\nProven patterns:');
    for (const p of relevantPatterns.slice(0, 3)) {
      lines.push(`  ✓ ${p.pattern}`);
    }
  }

  // Domain terms
  if (brain.domain.terms.length > 0) {
    lines.push(`\nDomain: ${brain.domain.terms.slice(0, 10).map(t => t.term).join(', ')}`);
  }

  lines.push(`\n(Evolved from ${brain.evolvedFrom} tasks)`);

  return lines.join('\n');
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

function generateInsight(task: TaskState, _brain: ProjectBrain): string {
  const files = task.files || [];
  const status = task.status;
  if (status === 'done' && files.length > 0) {
    return `Completed "${task.name}" touching ${files.length} files in ${[...new Set(files.map(f => path.dirname(f)))].join(', ')}`;
  }
  if (status === 'failed') {
    return `Failed "${task.name}": ${task.execution?.errorType || 'unknown'} — files: ${files.join(', ')}`;
  }
  return `Task "${task.name}" → ${status}`;
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
