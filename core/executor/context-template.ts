/**
 * Context Bundle Templates for Subagents.
 *
 * v4.3: 移除 learning/project-brain 注入路径（本项目无 brain.json 数据；其他项目若需
 * 架构摘要可通过 hierarchical CONTEXT.md / LSP symbols 获得）。
 *
 * Token budgets (per target)：见 CONTEXT_BUDGET 表。
 */

import { summarizeFile } from '../context/summary-cache.js';
import { readTask } from '../state/task-graph.js';
import type { TaskState, RoutingTarget } from '../types.js';

/** 实现前检查清单 — 防止 agent 自行补全关键细节时出错 */
const PRE_IMPL_CHECKLIST = [
  'Pre-implementation checklist:',
  '- Use ALL function parameters. Never hardcode a value that is passed as an argument.',
  '- Match the return type EXACTLY as specified in the Interface section.',
  '- If importing other modules, check their actual exported function signatures first.',
  '- Handle errors: return error info, do not throw unhandled exceptions.',
].join('\n');

/** Surgical Changes 约束（inspired by Karpathy guidelines） */
const SURGICAL_CHANGES_RULE = [
  'Rules: surgical changes only.',
  '- Only touch what the task requires. Do not "improve" adjacent code or formatting.',
  '- Match existing style, even if you would do it differently.',
  '- Clean up only orphans YOUR changes created. Do not remove pre-existing dead code.',
  '- Do not create test files unless explicitly listed in "Files to modify".',
].join('\n');

export interface MinimalContext {
  instruction: string;
  estimatedTokens: number;
}

/**
 * 上下文利用率 40% 阈值（参见 Harness Engineering: Smart Zone / Dumb Zone）
 * 超过此阈值 LLM 输出质量下降：幻觉、循环、格式错误。
 */
const CONTEXT_BUDGET: Record<string, number> = {
  opencode: 6000,     // glm-4.7: ~16K window → 40% ≈ 6K
  codexfake: 12000,   // gpt-5.4-mini: ~32K → 40% ≈ 12K
  'cc-haiku': 8000,   // v4.2: Haiku 4.5 ~200K 但作为简单任务保守用
  'cc-sonnet': 20000, // v4.2: Sonnet 4.6 中复杂任务
  'claude-code': 40000, // Opus 4.6
  'claude-app': 20000,
  'agent-teams': 8000,
};

/**
 * Generate context bundle for a routing target.
 * Each target gets the right depth of context — no more, no less.
 */
export function buildMinimalContext(
  projectDir: string,
  task: TaskState,
  target: RoutingTarget
): MinimalContext {
  let result: MinimalContext;
  switch (target) {
    case 'opencode':
      result = buildOpenCodeContext(projectDir, task); break;
    case 'codexfake':
      result = buildCodexContext(projectDir, task); break;
    case 'claude-app':
      result = buildClaudeAppContext(projectDir, task); break;
    case 'agent-teams':
      result = buildTeamContext(projectDir, task); break;
    case 'claude-code':
    default:
      result = buildClaudeCodeContext(projectDir, task); break;
  }

  // v4.3: 窄带符号指路（默认开启）— 只列 task.files + 依赖任务文件的 top-level 符号，
  // 典型 < 500 字符。agent 自带本地文件访问能力，我们只负责"指路"不负责"搬运"。
  // HAM_SYMBOL_MAP=0 可关闭；HAM_HIERARCHICAL_CONTEXT=1 切回 v4.2 的同目录全量注入。
  if (task.files && task.files.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../context/hierarchical.js');
      if (process.env.HAM_HIERARCHICAL_CONTEXT === '1') {
        // 兼容路径：老的全量注入
        const hier = mod.contextForFiles(projectDir, task.files);
        if (hier && hier.length > 0) {
          result.instruction += `\n\n## Directory Context (LSP symbols)\n${hier}`;
          result.estimatedTokens += Math.ceil(hier.length / 4);
        }
      } else if (process.env.HAM_SYMBOL_MAP !== '0') {
        // 默认：窄带符号指路。task.files + dep files（agent 自己去读实际代码）
        const depFiles: string[] = [];
        for (const depId of task.blockedBy || []) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { readTask } = require('../state/task-graph.js');
            const dep = readTask(projectDir, depId);
            if (dep?.status === 'done' && dep.files) {
              for (const f of dep.files) if (!task.files.includes(f)) depFiles.push(f);
            }
          } catch { /* skip */ }
        }
        const mapOwn = mod.symbolMapForFiles(projectDir, task.files, { maxLines: 30 });
        const mapDep = mod.symbolMapForFiles(projectDir, depFiles, { maxLines: 20 });
        if (mapOwn || mapDep) {
          const lines = ['', '## Symbols in scope (agent reads actual code if needed)'];
          if (mapOwn) lines.push('### Task files', mapOwn);
          if (mapDep) lines.push('### Dependency files', mapDep);
          const block = lines.join('\n');
          result.instruction += `\n${block}`;
          result.estimatedTokens += Math.ceil(block.length / 4);
        }
      }
    } catch { /* context injection optional */ }
  }

  // 上下文利用率检查（40% Smart Zone 阈值）
  const budget = CONTEXT_BUDGET[target] || 12000;
  if (result.estimatedTokens > budget) {
    const pct = Math.round((result.estimatedTokens / budget) * 100);
    result.instruction += `\n\n⚠️ Context budget warning: ${result.estimatedTokens} tokens (${pct}% of ${budget} budget). 超出 Smart Zone，输出质量可能下降。`;
  }

  return result;
}

// ==================== 共享工具函数 ====================

/** 任务相关文件的阅读清单（任务文件 + 依赖任务源码文件，不含文件内容） */
function getReadingList(projectDir: string, task: TaskState): string {
  const taskFiles = new Set(task.files || []);
  const entries: string[] = [];

  for (const f of taskFiles) {
    const summary = summarizeFile(projectDir, f);
    entries.push(`- ${f} — ${summary.tokens > 0 ? `${summary.tokens} tokens` : 'new file'}`);
  }

  const configExts = new Set(['.json', '.yaml', '.yml', '.toml', '.md']);
  const deps = task.blockedBy || [];
  for (const depId of deps) {
    const depTask = readTask(projectDir, depId);
    if (!depTask || depTask.status !== 'done') continue;
    for (const f of depTask.files || []) {
      if (taskFiles.has(f)) continue;
      const ext = f.slice(f.lastIndexOf('.'));
      if (configExts.has(ext)) continue;
      entries.push(`- ${f} — upstream from ${depId}`);
    }
  }

  return entries.join('\n');
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

// ==================== Per-Target Builders ====================

/** OpenCode: task + conventions + file summaries (~1-1.5K tokens) */
function buildOpenCodeContext(projectDir: string, task: TaskState): MinimalContext {
  const lines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
  ];

  // 文件摘要（~500 tokens 预算）
  const summaries = getReadingList(projectDir, task);
  if (summaries) {
    lines.push('', '## Read these files', summaries);
  }

  // 依赖产出
  const deps = getDependencyOutputs(projectDir, task);
  if (deps) {
    lines.push('', '## Dependencies (completed)', deps);
  }

  lines.push('', SURGICAL_CHANGES_RULE);

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
  ];

  // 文件摘要（~800 tokens 预算）
  const summaries = getReadingList(projectDir, task);
  if (summaries) {
    lines.push('', '## Read these files', summaries);
  }

  // 依赖任务产出
  const deps = getDependencyOutputs(projectDir, task);
  if (deps) {
    lines.push('', '## Dependencies (completed)', deps);
  }

  lines.push('', SURGICAL_CHANGES_RULE);

  // codexfake 任务自动追加实现检查清单（防止 agent 自行补全关键细节时出错）
  lines.push('', PRE_IMPL_CHECKLIST);

  const text = lines.filter(Boolean).join('\n');
  return { instruction: text, estimatedTokens: Math.ceil(text.length / 4) };
}

/** Claude App: task + conventions (~1K tokens) */
function buildClaudeAppContext(projectDir: string, task: TaskState): MinimalContext {
  const lines = [
    `Task: ${task.name}`,
    task.spec?.description || '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
  ];

  // 依赖产出
  const deps = getDependencyOutputs(projectDir, task);
  if (deps) {
    lines.push('', 'Dependencies:', deps);
  }

  const text = lines.filter(Boolean).join('\n');
  return { instruction: text, estimatedTokens: Math.ceil(text.length / 4) };
}

/** 分解 claude-code context 各块 token 贡献（离线瘦身分析用，v4.1） */
export interface ContextBreakdown {
  total: number;
  sections: {
    spec: number;         // task 描述、interface、acceptance、files
    dependencies: number; // 依赖任务产出
  };
}
export function breakdownClaudeCodeContext(projectDir: string, task: TaskState): ContextBreakdown {
  const tk = (s: string) => Math.ceil(s.length / 4);
  const specLines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const deps = getDependencyOutputs(projectDir, task) || '';

  const sections = {
    spec: tk(specLines),
    dependencies: tk(deps),
  };
  return { total: Object.values(sections).reduce((a, b) => a + b, 0), sections };
}

/** Claude Code: task + dependencies (~1-2K tokens 基础，分层 CONTEXT.md 另注入) */
function buildClaudeCodeContext(projectDir: string, task: TaskState): MinimalContext {
  const lines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    task.files?.length ? `Files: ${task.files.join(', ')}` : '',
  ];

  // 依赖产出
  const deps = getDependencyOutputs(projectDir, task);
  if (deps) {
    lines.push('', '## Dependencies (completed)', deps);
  }

  const text = lines.filter(Boolean).join('\n');
  return { instruction: text, estimatedTokens: Math.ceil(text.length / 4) };
}

/** Agent Teams: task + file summaries (~2K tokens per member) */
function buildTeamContext(projectDir: string, task: TaskState): MinimalContext {
  const lines = [
    `# ${task.name}`,
    task.spec?.description || '',
    task.spec?.interface ? `Interface: ${task.spec.interface}` : '',
    task.spec?.acceptance ? `Acceptance: ${task.spec.acceptance}` : '',
    task.files?.length ? `Own files: ${task.files.join(', ')}` : '',
  ];

  // 文件摘要（~600 tokens 预算）
  const summaries = getReadingList(projectDir, task);
  if (summaries) {
    lines.push('', '## Read these files', summaries);
  }

  // 依赖产出
  const deps = getDependencyOutputs(projectDir, task);
  if (deps) {
    lines.push('', '## Dependencies (completed)', deps);
  }

  lines.push('', 'Rules: only edit your assigned files. Commit atomically.', SURGICAL_CHANGES_RULE);

  const text = lines.filter(Boolean).join('\n');
  return { instruction: text, estimatedTokens: Math.ceil(text.length / 4) };
}
