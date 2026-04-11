// core/dag/parser.js
'use strict';
const fs = require('fs');

/**
 * Parse a structured plan file into task objects.
 * Expects markdown with task blocks containing id, name, files, dependencies, spec.
 * This is a best-effort parser — AI fills gaps for unstructured plans.
 */
function parsePlanToTasks(planContent, milestone, phase) {
  const tasks = [];
  // Match markdown headers that look like tasks: ### Task N: Name
  const taskRegex = /###\s+(?:Task\s+)?(\d+)[:.]\s*(.+)/g;
  let match;
  let taskNum = 1;

  while ((match = taskRegex.exec(planContent)) !== null) {
    const id = `task-${String(taskNum).padStart(3, '0')}`;
    const name = match[2].trim();

    // Extract files from the section after the header
    const sectionStart = match.index + match[0].length;
    const nextHeader = planContent.indexOf('\n### ', sectionStart + 1);
    const section = planContent.slice(sectionStart, nextHeader > -1 ? nextHeader : undefined);

    const files = [];
    const fileRegex = /[`"]([^\s`"]+\.[a-zA-Z]+)[`"]/g;
    let fileMatch;
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

module.exports = { parsePlanToTasks };
