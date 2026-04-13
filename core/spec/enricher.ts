// core/spec/enricher.ts — Spec enricher (OpenSpec + heuristic)
import type { TaskState, TaskSpec } from '../types.js';
import { detectOpenSpec, readChangeArtifacts } from './reader.js';
import type { ChangeArtifacts } from './reader.js';
import { readTask, writeTask, readAllTasks } from '../state/task-graph.js';
import fs from 'fs';

export interface SpecEnrichResult {
  taskId: string;
  enriched: boolean;
  source: 'openspec' | 'heuristic';
  specScore: number;
  spec: TaskSpec;
}

/**
 * Calculate spec completeness score (0-100)
 */
export function calculateSpecScore(spec: TaskSpec): number {
  let score = 0;
  if (spec.description && spec.description.length > 20) score += 25;
  if (spec.interface && spec.interface.length > 0) score += 25;
  if (spec.acceptance && spec.acceptance.length > 0) score += 25;
  if (spec.completeness >= 80) score += 25;
  return Math.min(score, 100);
}

/**
 * Try to enrich task spec from OpenSpec change artifacts
 */
function enrichFromOpenSpec(task: TaskState, projectDir: string): SpecEnrichResult | null {
  const project = detectOpenSpec(projectDir);
  if (!project.hasOpenSpec) return null;

  // Try to find a matching change (fuzzy match on task name)
  const taskNameLower = task.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const matchedChange = project.changes.find(c => {
    const changeLower = c.name.toLowerCase();
    return taskNameLower.includes(changeLower) || changeLower.includes(taskNameLower.slice(0, 15));
  });

  if (!matchedChange) return null;

  const artifacts = readChangeArtifacts(projectDir, matchedChange.name);
  if (!artifacts) return null;

  // Extract spec info from artifacts
  const spec: TaskSpec = {
    description: artifacts.proposal ? extractFirstParagraph(artifacts.proposal) : task.spec.description,
    interface: extractInterface(artifacts.design || ''),
    acceptance: extractAcceptance(artifacts.specs, artifacts.tasks || ''),
    completeness: calculateArtifactCompleteness(artifacts),
  };

  // Update task.files if artifacts have more file info
  if (artifacts.files.length > task.files.length) {
    task.files = [...new Set([...task.files, ...artifacts.files])];
    task.context.requiredFiles = task.files;
  }

  return {
    taskId: task.id,
    enriched: true,
    source: 'openspec',
    specScore: calculateSpecScore(spec),
    spec,
  };
}

/**
 * Heuristic enrichment (best-effort when no OpenSpec available)
 */
function enrichHeuristic(task: TaskState, _projectDir: string): SpecEnrichResult {
  const spec: TaskSpec = { ...task.spec };

  // Infer interface from task name
  if (!spec.interface) {
    const name = task.name.toLowerCase();
    if (name.includes('api') || name.includes('接口')) {
      spec.interface = `API endpoint for: ${task.name}`;
    } else if (name.includes('gui') || name.includes('页面') || name.includes('组件')) {
      spec.interface = `UI component: ${task.name}`;
    } else if (name.includes('test') || name.includes('测试')) {
      spec.interface = `Test suite: ${task.name}`;
    }
  }

  // Infer acceptance from task name
  if (!spec.acceptance) {
    if (task.files.length > 0) {
      spec.acceptance = `Modified files compile and pass tests: ${task.files.join(', ')}`;
    } else {
      spec.acceptance = `Feature "${task.name}" is functional and verified`;
    }
  }

  // Calculate completeness based on available info
  spec.completeness = Math.min(
    (spec.description.length > 20 ? 25 : 0) +
    (spec.interface ? 25 : 0) +
    (spec.acceptance ? 25 : 0) +
    (task.files.length > 0 ? 25 : 0),
    100,
  );

  return {
    taskId: task.id,
    enriched: true,
    source: 'heuristic',
    specScore: calculateSpecScore(spec),
    spec,
  };
}

/**
 * Enrich a single task's spec
 */
export function enrichTaskSpec(task: TaskState, projectDir: string): SpecEnrichResult {
  // Try OpenSpec first, fall back to heuristic
  const openspecResult = enrichFromOpenSpec(task, projectDir);
  if (openspecResult) return openspecResult;
  return enrichHeuristic(task, projectDir);
}

/**
 * Enrich and persist a task
 */
export function enrichAndSaveTask(projectDir: string, taskId: string): SpecEnrichResult {
  const task = readTask(projectDir, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const result = enrichTaskSpec(task, projectDir);
  task.spec = result.spec;
  task.scores.specScore = result.specScore;
  task.context.requiredFiles = task.files;
  writeTask(projectDir, task);

  return result;
}

/**
 * Batch enrich all pending tasks
 */
export function enrichAllTasks(projectDir: string): SpecEnrichResult[] {
  const tasks: TaskState[] = readAllTasks(projectDir);
  const results: SpecEnrichResult[] = [];

  for (const task of tasks) {
    if (task.status === 'pending' || task.status === 'blocked') {
      const result = enrichAndSaveTask(projectDir, task.id);
      results.push(result);
    }
  }

  return results;
}

// --- Helper functions ---

function extractFirstParagraph(markdown: string): string {
  const lines = markdown.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  return lines.slice(0, 3).join(' ').trim().substring(0, 500);
}

function extractInterface(design: string): string {
  // Extract interface info from design.md
  const interfaceMatch = design.match(/## (?:Interface|API|接口)\s*\n([\s\S]*?)(?=\n## |$)/i);
  if (interfaceMatch) return interfaceMatch[1].trim().substring(0, 500);

  // Extract interface definitions from code blocks
  const codeMatch = design.match(/```(?:typescript|ts|javascript|js)\n([\s\S]*?)```/);
  if (codeMatch) return codeMatch[1].trim().substring(0, 500);

  return '';
}

function extractAcceptance(specFiles: string[], tasks: string): string {
  // Extract GIVEN/WHEN/THEN from spec files
  const scenarios: string[] = [];
  for (const specFile of specFiles) {
    try {
      const content = fs.readFileSync(specFile, 'utf8');
      const scenarioRegex = /- (GIVEN|WHEN|THEN|AND) (.+)/g;
      let match: RegExpExecArray | null;
      while ((match = scenarioRegex.exec(content)) !== null) {
        scenarios.push(`${match[1]} ${match[2]}`);
      }
    } catch { /* ignore read errors */ }
  }

  if (scenarios.length > 0) return scenarios.slice(0, 10).join('\n');

  // Extract acceptance criteria from tasks.md
  const acceptMatch = tasks.match(/## (?:Acceptance|验收|Done when)\s*\n([\s\S]*?)(?=\n## |$)/i);
  if (acceptMatch) return acceptMatch[1].trim().substring(0, 500);

  return '';
}

function calculateArtifactCompleteness(artifacts: ChangeArtifacts): number {
  let score = 0;
  if (artifacts.proposal) score += 25;
  if (artifacts.design) score += 25;
  if (artifacts.tasks) score += 25;
  if (artifacts.specs.length > 0) score += 25;
  return score;
}
