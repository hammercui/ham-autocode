/**
 * Minimal Context Templates for Subagents.
 * Each routing target gets only the context it needs — no more.
 *
 * Token savings:
 * - opencode:    ~1K tokens (task + files only)
 * - codex:       ~2K tokens (task + files + conventions)
 * - claude-app:  ~1K tokens (task summary)
 * - claude-code: ~3-5K tokens (task + brain + entities)
 * - agent-teams: ~2K tokens per teammate
 */

import { readBrain } from '../learning/project-brain.js';
import { searchEntities, readEntityIndex } from '../learning/code-entities.js';
import type { TaskState, RoutingTarget } from '../types.js';

export interface MinimalContext {
  instruction: string;
  estimatedTokens: number;
}

/**
 * Generate minimal context for a routing target.
 * Replaces verbose full-project context with targeted information.
 */
export function buildMinimalContext(
  projectDir: string,
  task: TaskState,
  target: RoutingTarget
): MinimalContext {
  switch (target) {
    case 'opencode':
      return buildOpenCodeContext(task);
    case 'codex':
      return buildCodexContext(projectDir, task);
    case 'claude-app':
      return buildClaudeAppContext(task);
    case 'agent-teams':
      return buildTeamContext(projectDir, task);
    case 'claude-code':
    default:
      return buildClaudeCodeContext(projectDir, task);
  }
}

/** OpenCode: minimal — task + files (~1K tokens) */
function buildOpenCodeContext(task: TaskState): MinimalContext {
  const lines = [
    `Task: ${task.name}`,
    task.spec?.description || '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
    'Keep changes minimal. Follow existing conventions.',
  ].filter(Boolean);
  return { instruction: lines.join('\n'), estimatedTokens: Math.ceil(lines.join('').length / 4) };
}

/** Codex: task + files + conventions (~2K tokens) */
function buildCodexContext(projectDir: string, task: TaskState): MinimalContext {
  const brain = readBrain(projectDir);
  const conventions = brain
    ? `Conventions: ${brain.conventions.language}, naming=${brain.conventions.fileNaming}, imports=${brain.conventions.importStyle}`
    : '';

  const lines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
    conventions,
  ].filter(Boolean);
  return { instruction: lines.join('\n'), estimatedTokens: Math.ceil(lines.join('').length / 4) };
}

/** Claude App: summary only (~1K tokens) */
function buildClaudeAppContext(task: TaskState): MinimalContext {
  const lines = [
    `Task: ${task.name}`,
    task.spec?.description || '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
  ].filter(Boolean);
  return { instruction: lines.join('\n'), estimatedTokens: Math.ceil(lines.join('').length / 4) };
}

/** Claude Code: task + brain summary + related entities (~3-5K tokens) */
function buildClaudeCodeContext(projectDir: string, task: TaskState): MinimalContext {
  const brain = readBrain(projectDir);
  const lines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
  ];

  // Add brain summary (compact)
  if (brain) {
    lines.push('', '## Project Context');
    if (brain.architecture.summary) lines.push(brain.architecture.summary);
    lines.push(`Conventions: ${brain.conventions.language}, ${brain.conventions.fileNaming}`);
    if (brain.painPoints.length > 0) {
      lines.push('Watch out: ' + brain.painPoints.slice(0, 3).map(p => p.issue).join('; '));
    }
  }

  // Add related entities (compact, max 10)
  const entityIndex = readEntityIndex(projectDir);
  if (entityIndex && task.name) {
    const keywords = task.name.split(/[\s-_]+/).filter(w => w.length > 2);
    const related = searchEntities(projectDir, keywords.join(' '));
    if (related.length > 0) {
      lines.push('', '## Related Code');
      for (const e of related.slice(0, 10)) {
        lines.push(`${e.type} ${e.name} @ ${e.file}:${e.line}`);
      }
    }
  }

  const text = lines.filter(Boolean).join('\n');
  return { instruction: text, estimatedTokens: Math.ceil(text.length / 4) };
}

/** Agent Teams: task + brief project info (~2K tokens per member) */
function buildTeamContext(projectDir: string, task: TaskState): MinimalContext {
  const brain = readBrain(projectDir);
  const lines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.files?.length ? `Own files: ${task.files.join(', ')}` : '',
    brain ? `Project: ${brain.architecture.summary}` : '',
    brain ? `Style: ${brain.conventions.language}, ${brain.conventions.fileNaming}` : '',
    'Rules: only edit your assigned files. Commit atomically.',
  ].filter(Boolean);
  return { instruction: lines.join('\n'), estimatedTokens: Math.ceil(lines.join('').length / 4) };
}
