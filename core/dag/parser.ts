// core/dag/parser.ts
import fs from 'fs';
import path from 'path';
import type { TaskState, ParseResult } from '../types.js';
import { writeTask } from '../state/task-graph.js';

/**
 * Parse a structured plan file into task objects.
 * Expects markdown with task blocks containing id, name, files, dependencies, spec.
 * This is a best-effort parser — AI fills gaps for unstructured plans.
 */
export function parsePlanToTasks(planContent: string, milestone?: string, phase?: string): TaskState[] {
  const tasks: TaskState[] = [];

  // Match multiple task formats:
  //   ## Task 1: Name / ### Task 1: Name / #### Task 1. Name
  //   - [ ] **T1: Name** / - [ ] **G1: Name**
  const patterns: RegExp[] = [
    /^#{2,4}\s+(?:Task\s+)?(\d+)[:.]\s*(.+)/gm,
    /^-\s+\[[ x]\]\s+\*\*[A-Z]+(\d+)[:.]?\s*(.+?)\*\*/gm,
  ];

  interface RawMatch { index: number; num: string; name: string; }
  const rawMatches: RawMatch[] = [];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(planContent)) !== null) {
      rawMatches.push({ index: match.index, num: match[1], name: match[2].trim() });
    }
  }

  // Sort by position in file
  rawMatches.sort((a, b) => a.index - b.index);

  let taskNum = 1;
  for (let i = 0; i < rawMatches.length; i++) {
    const raw = rawMatches[i];
    const id = `task-${String(taskNum).padStart(3, '0')}`;
    const name = raw.name;

    // Extract section between this match and the next
    const sectionStart = raw.index;
    const sectionEnd = i + 1 < rawMatches.length ? rawMatches[i + 1].index : planContent.length;
    const section = planContent.slice(sectionStart, sectionEnd);

    const files: string[] = [];
    const fileRegex = /[`"]([^\s`"]+\.[a-zA-Z]+)[`"]/g;
    let fileMatch: RegExpExecArray | null;
    while ((fileMatch = fileRegex.exec(section)) !== null) {
      if (!files.includes(fileMatch[1])) files.push(fileMatch[1]);
    }

    tasks.push({
      schemaVersion: 2,
      id,
      name,
      milestone: milestone || 'M001',
      phase: phase || 'default',
      status: 'pending',
      blockedBy: [],
      files,
      spec: { description: name, interface: '', acceptance: '', completeness: 0 },
      scores: { specScore: 0, complexityScore: 0, isolationScore: 0 },
      routing: { target: 'claude-code', reason: 'default', needsConfirmation: false, confirmed: false },
      recovery: { strategy: 'checkpoint', checkpointRef: null },
      validation: { gates: [], attempts: 0, maxAttempts: 2, results: [] },
      context: { requiredFiles: files, estimatedTokens: 0 },
      execution: { sessionId: null, startedAt: null, completedAt: null, error: null, errorType: null },
    });
    taskNum++;
  }

  // Gap A3: Infer dependencies from file overlap
  // If task B references files that task A creates/modifies, B may depend on A
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const taskA = tasks[i];
      const taskB = tasks[j];
      // Check if B's files overlap with A's files
      const overlap = taskB.files.some(f => taskA.files.includes(f));
      if (overlap && !taskB.blockedBy.includes(taskA.id)) {
        taskB.blockedBy.push(taskA.id);
      }
    }
  }

  return tasks;
}

export function findPlanFile(projectDir: string): string | null {
  const candidates = [
    path.join(projectDir, 'PLAN.md'),
    path.join(projectDir, 'WBS.md'),
    path.join(projectDir, 'docs', 'PLAN.md'),
    path.join(projectDir, 'docs', 'WBS.md'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function initTasksFromPlan(
  projectDir: string,
  planFile: string | null | undefined,
  milestone?: string,
  phase?: string,
): ParseResult {
  const resolvedPlanFile = planFile ? path.resolve(projectDir, planFile) : findPlanFile(projectDir);
  if (!resolvedPlanFile || !fs.existsSync(resolvedPlanFile)) {
    throw new Error('No PLAN.md or WBS.md found for dag init');
  }

  const content = fs.readFileSync(resolvedPlanFile, 'utf8');
  const tasks = parsePlanToTasks(content, milestone, phase);
  for (const task of tasks) {
    writeTask(projectDir, task);
  }

  return {
    planFile: resolvedPlanFile,
    count: tasks.length,
    tasks,
  };
}
