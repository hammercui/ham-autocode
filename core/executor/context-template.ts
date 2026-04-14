/**
 * Context Bundle Templates for Subagents.
 *
 * v3.6 fix: 接通 ContextManager + brain + entities + DAG 依赖产出管道。
 * 所有 5 个 target 都能拿到 "刚好够用" 的上下文包。
 *
 * Token budgets (per target):
 * - opencode:    ~1-1.5K tokens (task + conventions + file summaries)
 * - codex:       ~2-2.5K tokens (task + conventions + file contents/summaries + entities + patterns)
 * - claude-app:  ~1K tokens (task summary + conventions)
 * - claude-code: ~3-5K tokens (task + brain index + entities + patterns)
 * - agent-teams: ~2K tokens per teammate (task + architecture + file summaries)
 */

import { readBrain, getBrainContext as getBrainContextFn } from '../learning/project-brain.js';
import { searchEntities, readEntityIndex } from '../learning/code-entities.js';
import { getPatternHints } from '../learning/patterns.js';
import { summarizeFile } from '../context/summary-cache.js';
import { readTask } from '../state/task-graph.js';
import type { TaskState, RoutingTarget } from '../types.js';

export interface MinimalContext {
  instruction: string;
  estimatedTokens: number;
}

/**
 * Generate context bundle for a routing target.
 * Each target gets the right depth of context — no more, no less.
 */
export function buildMinimalContext(
  projectDir: string,
  task: TaskState,
  target: RoutingTarget
): MinimalContext {
  switch (target) {
    case 'opencode':
      return buildOpenCodeContext(projectDir, task);
    case 'codex':
      return buildCodexContext(projectDir, task);
    case 'claude-app':
      return buildClaudeAppContext(projectDir, task);
    case 'agent-teams':
      return buildTeamContext(projectDir, task);
    case 'claude-code':
    default:
      return buildClaudeCodeContext(projectDir, task);
  }
}

// ==================== 共享工具函数 ====================

/** 获取 brain conventions 文本 */
function getConventions(projectDir: string): string {
  const brain = readBrain(projectDir);
  if (!brain) return '';
  const c = brain.conventions;
  const parts = [
    c.importStyle && `imports=${c.importStyle}`,
    c.fileNaming && `naming=${c.fileNaming}`,
    c.testPattern && `test=${c.testPattern}`,
  ].filter(Boolean);
  return parts.length > 0 ? `Conventions: ${parts.join(', ')}` : '';
}

/** 获取 brain architecture 中与任务相关的模块 */
function getRelatedModules(projectDir: string, task: TaskState): string {
  const brain = readBrain(projectDir);
  if (!brain?.architecture?.keyModules?.length) return '';
  const taskFiles = task.files || [];
  // 找到任务文件所在的模块
  const related = brain.architecture.keyModules.filter(m =>
    taskFiles.some(f => f.startsWith(m.path) || f.includes(m.name))
  );
  if (related.length === 0) return '';
  return related.map(m => `- ${m.path}: ${m.role}`).join('\n');
}

/** 获取相关代码实体（接口签名） */
function getRelatedEntities(projectDir: string, task: TaskState, max: number): string {
  const entityIndex = readEntityIndex(projectDir);
  if (!entityIndex) return '';
  // 从任务名和文件路径提取关键词
  const nameWords = (task.name || '').split(/[\s\-_/]+/).filter(w => w.length > 2);
  const fileWords = (task.files || []).flatMap(f => f.split(/[\s\-_/.]+/).filter(w => w.length > 2));
  const keywords = [...new Set([...nameWords, ...fileWords])].join(' ');
  if (!keywords) return '';
  const entities = searchEntities(projectDir, keywords);
  if (entities.length === 0) return '';
  return entities.slice(0, max).map(e => `${e.type} ${e.name} @ ${e.file}:${e.line}\n  ${e.signature}`).join('\n');
}

/** 获取任务所需文件的摘要（接口签名提取） */
function getFileSummaries(projectDir: string, task: TaskState, maxTokens: number): string {
  const files = task.context?.requiredFiles || task.files || [];
  if (files.length === 0) return '';
  const summaries: string[] = [];
  let totalTokens = 0;
  for (const f of files) {
    const summary = summarizeFile(projectDir, f);
    if (summary.summary && summary.summaryTokens > 0 && totalTokens + summary.summaryTokens <= maxTokens) {
      summaries.push(summary.summary);
      totalTokens += summary.summaryTokens;
    } else if (summary.summary && totalTokens < maxTokens) {
      // 截断到预算
      const remaining = maxTokens - totalTokens;
      summaries.push(summary.summary.substring(0, remaining * 4));
      break;
    }
  }
  return summaries.join('\n\n');
}

/** 获取 DAG 依赖任务的产出摘要 */
function getDependencyOutputs(projectDir: string, task: TaskState): string {
  const deps = task.blockedBy || [];
  if (deps.length === 0) return '';
  const outputs: string[] = [];
  for (const depId of deps) {
    const depTask = readTask(projectDir, depId);
    if (!depTask || depTask.status !== 'done') continue;
    const depFiles = depTask.files || [];
    // 输出依赖任务的文件和接口信息
    outputs.push(`${depId} (${depTask.name}): ${depFiles.join(', ')}`);
    // 如果依赖任务有 spec.interface，也带上
    if (depTask.spec?.interface) {
      outputs.push(`  interface: ${depTask.spec.interface}`);
    }
  }
  return outputs.length > 0 ? outputs.join('\n') : '';
}

/** 获取 pattern hints */
function getHints(projectDir: string, taskName: string): string {
  const hints = getPatternHints(projectDir, taskName);
  return hints.length > 0 ? hints.join('; ') : '';
}

// ==================== Per-Target Builders ====================

/** OpenCode: task + conventions + file summaries (~1-1.5K tokens) */
function buildOpenCodeContext(projectDir: string, task: TaskState): MinimalContext {
  const lines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
    getConventions(projectDir),
  ];

  // 文件摘要（~500 tokens 预算）
  const summaries = getFileSummaries(projectDir, task, 500);
  if (summaries) {
    lines.push('', '## File Signatures', summaries);
  }

  // 依赖产出
  const deps = getDependencyOutputs(projectDir, task);
  if (deps) {
    lines.push('', '## Dependencies (completed)', deps);
  }

  lines.push('', 'Keep changes minimal. Follow existing conventions.');

  const text = lines.filter(Boolean).join('\n');
  return { instruction: text, estimatedTokens: Math.ceil(text.length / 4) };
}

/** Codex: task + conventions + file summaries + entities + patterns (~2-2.5K tokens) */
function buildCodexContext(projectDir: string, task: TaskState): MinimalContext {
  const lines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
    getConventions(projectDir),
  ];

  // 相关模块
  const modules = getRelatedModules(projectDir, task);
  if (modules) {
    lines.push('', '## Project Modules (relevant)', modules);
  }

  // 文件摘要（~800 tokens 预算）
  const summaries = getFileSummaries(projectDir, task, 800);
  if (summaries) {
    lines.push('', '## File Signatures', summaries);
  }

  // 相关代码实体（接口签名，max 8）
  const entities = getRelatedEntities(projectDir, task, 8);
  if (entities) {
    lines.push('', '## Related Interfaces', entities);
  }

  // 依赖任务产出
  const deps = getDependencyOutputs(projectDir, task);
  if (deps) {
    lines.push('', '## Dependencies (completed)', deps);
  }

  // 经验提示
  const hints = getHints(projectDir, task.name);
  if (hints) {
    lines.push('', `Hints: ${hints}`);
  }

  lines.push('', 'Implement ONLY what is specified. Do not modify files outside scope.');

  const text = lines.filter(Boolean).join('\n');
  return { instruction: text, estimatedTokens: Math.ceil(text.length / 4) };
}

/** Claude App: task + conventions (~1K tokens) */
function buildClaudeAppContext(projectDir: string, task: TaskState): MinimalContext {
  const lines = [
    `Task: ${task.name}`,
    task.spec?.description || '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
    getConventions(projectDir),
  ];

  // 依赖产出
  const deps = getDependencyOutputs(projectDir, task);
  if (deps) {
    lines.push('', 'Dependencies:', deps);
  }

  const text = lines.filter(Boolean).join('\n');
  return { instruction: text, estimatedTokens: Math.ceil(text.length / 4) };
}

/** Claude Code: task + compact brain index + related entities (~3-5K tokens) */
function buildClaudeCodeContext(projectDir: string, task: TaskState): MinimalContext {
  const lines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
  ];

  // v3.5: Progressive disclosure — compact brain index (~150 tokens)
  const brainIndex = getBrainContextFn(projectDir, task.name);
  if (brainIndex) {
    lines.push('', brainIndex);
  }

  // Related entities (max 10)
  const entities = getRelatedEntities(projectDir, task, 10);
  if (entities) {
    lines.push('', '## Related Code', entities);
  }

  // 依赖产出
  const deps = getDependencyOutputs(projectDir, task);
  if (deps) {
    lines.push('', '## Dependencies (completed)', deps);
  }

  // Pattern hints
  const hints = getHints(projectDir, task.name);
  if (hints) {
    lines.push('', 'Hints: ' + hints);
  }

  const text = lines.filter(Boolean).join('\n');
  return { instruction: text, estimatedTokens: Math.ceil(text.length / 4) };
}

/** Agent Teams: task + architecture + file summaries (~2K tokens per member) */
function buildTeamContext(projectDir: string, task: TaskState): MinimalContext {
  const brain = readBrain(projectDir);
  const lines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    task.files?.length ? `Own files: ${task.files.join(', ')}` : '',
    brain ? `Project: ${brain.architecture.summary}` : '',
    getConventions(projectDir),
  ];

  // 文件摘要（~600 tokens 预算）
  const summaries = getFileSummaries(projectDir, task, 600);
  if (summaries) {
    lines.push('', '## File Signatures', summaries);
  }

  // 依赖产出
  const deps = getDependencyOutputs(projectDir, task);
  if (deps) {
    lines.push('', '## Dependencies (completed)', deps);
  }

  lines.push('', 'Rules: only edit your assigned files. Commit atomically.');

  const text = lines.filter(Boolean).join('\n');
  return { instruction: text, estimatedTokens: Math.ceil(text.length / 4) };
}
