/**
 * Diagnosis — 任务失败时生成结构化诊断报告。
 *
 * Skill-First: 用 opencode (免费) 做轻量诊断，不调用 /investigate (Opus)。
 * 目的: 积累诊断数据 → 为后续自动修复打基础；当前阶段告诉用户为什么失败。
 */

import fs from 'fs';
import path from 'path';
import type { TaskState } from '../types.js';

export type FailureCategory =
  | 'spec-issue'       // spec 描述不清/文件路径错误
  | 'agent-limitation' // agent 能力不足以完成此任务
  | 'env-issue'        // 环境问题 (tsconfig/依赖/权限)
  | 'dep-missing'      // 依赖任务未完成或产出缺失
  | 'unknown';

export interface DiagnosisEntry {
  timestamp: string;
  taskId: string;
  taskName: string;
  failCount: number;
  lastError: string;
  category: FailureCategory;
  reasoning: string;
  suggestedAction: string;
}

/**
 * 根据任务 spec 和错误信息进行规则诊断（不调用 AI，零 token 消耗）。
 */
export function diagnoseFailure(
  task: TaskState,
  failCount: number,
  lastError: string,
): DiagnosisEntry {
  const category = classifyError(task, lastError);
  const reasoning = buildReasoning(category, task, lastError);
  const suggestedAction = suggestAction(category, task);

  return {
    timestamp: new Date().toISOString(),
    taskId: task.id,
    taskName: task.name,
    failCount,
    lastError: lastError.slice(0, 200),
    category,
    reasoning,
    suggestedAction,
  };
}

/**
 * 将诊断追加到 diagnosis.jsonl
 */
export function saveDiagnosis(projectDir: string, entry: DiagnosisEntry): void {
  const logDir = path.join(projectDir, '.ham-autocode', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(path.join(logDir, 'diagnosis.jsonl'), JSON.stringify(entry) + '\n');
}

// ─── 规则分类引擎 ────────────────────────────────────────────

function classifyError(task: TaskState, error: string): FailureCategory {
  const errLower = error.toLowerCase();

  // spec 问题: 文件路径不存在、spec 描述过短
  if (errLower.includes('no such file') || errLower.includes('enoent') || errLower.includes('cannot find module')) {
    // 如果错误指向 task.files 中的路径，大概率是 spec 给错了文件路径
    const taskFiles = task.files || [];
    if (taskFiles.some((f: string) => errLower.includes(f.toLowerCase()))) {
      return 'spec-issue';
    }
    return 'dep-missing';
  }

  if (!task.spec?.description || task.spec.description.length < 30) {
    return 'spec-issue';
  }

  // 环境问题: tsc 错误、依赖缺失、权限
  if (errLower.includes('ts2') || errLower.includes('typescript') || errLower.includes('tsc')) {
    return 'env-issue';
  }
  if (errLower.includes('permission denied') || errLower.includes('eacces')) {
    return 'env-issue';
  }
  if (errLower.includes('cannot resolve') || errLower.includes('module not found')) {
    return 'dep-missing';
  }

  // agent 能力不足: timeout、超长输出、complexity 过高
  if (errLower.includes('timeout') || errLower.includes('timed out')) {
    return (task.scores?.complexityScore ?? 50) >= 70 ? 'agent-limitation' : 'env-issue';
  }
  if (errLower.includes('all agents failed') || errLower.includes('fallback exhausted')) {
    return 'agent-limitation';
  }

  return 'unknown';
}

function buildReasoning(category: FailureCategory, task: TaskState, error: string): string {
  switch (category) {
    case 'spec-issue':
      return `Spec 可能有问题 — description 仅 ${task.spec?.description?.length || 0} 字符, files: [${(task.files || []).join(', ')}]. 错误: ${error.slice(0, 100)}`;
    case 'agent-limitation':
      return `Agent 能力不足 — complexity ${task.scores?.complexityScore ?? '?'}, 任务可能需要升级到更强 agent 或拆分`;
    case 'env-issue':
      return `环境/编译问题 — 可能是 tsconfig 配置、依赖版本或文件权限问题. 错误: ${error.slice(0, 100)}`;
    case 'dep-missing':
      return `依赖缺失 — 需要的模块或文件不存在, 可能上游任务未完成. 错误: ${error.slice(0, 100)}`;
    default:
      return `未分类错误: ${error.slice(0, 150)}`;
  }
}

function suggestAction(category: FailureCategory, task: TaskState): string {
  switch (category) {
    case 'spec-issue':
      return '重新生成 spec (--regenerate-spec) 或手动修正 files 路径';
    case 'agent-limitation':
      return `升级到 claude-code 执行, 或拆分为更小子任务 (当前 complexity: ${task.scores?.complexityScore ?? '?'})`;
    case 'env-issue':
      return '检查 tsconfig.json 配置 + npm install 确保依赖完整';
    case 'dep-missing':
      return '检查 blockedBy 依赖是否已完成, 确认上游产出文件存在';
    default:
      return '需要人工分析错误日志';
  }
}
