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
  // Match markdown headers that look like tasks: ### Task N: Name
  const taskRegex = /###\s+(?:Task\s+)?(\d+)[:.]\s*(.+)/g;
  let match: RegExpExecArray | null;
  let taskNum = 1;

  while ((match = taskRegex.exec(planContent)) !== null) {
    const id = `task-${String(taskNum).padStart(3, '0')}`;
    const name = match[2].trim();

    // Extract files from the section after the header
    const sectionStart = match.index + match[0].length;
    const nextHeader = planContent.indexOf('\n### ', sectionStart + 1);
    const section = planContent.slice(sectionStart, nextHeader > -1 ? nextHeader : undefined);

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

  // Infer dependencies: if task B's files overlap with task A's, B may depend on A
  // (Best-effort — AI should refine via dag init)

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
