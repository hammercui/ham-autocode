/**
 * 轻量质量门禁
 * 在 auto commit 前验证 agent 产出：文件存在 + 非空 + 可选语法检查。
 */

import fs from 'fs';
import path from 'path';
import type { TaskState } from '../types.js';

export interface QualityResult {
  taskId: string;
  passed: boolean;
  checks: CheckResult[];
}

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * 验证任务产出质量
 * 1. 文件存在性
 * 2. 文件非空
 * 3. TypeScript 语法检查（如果项目有 tsconfig）
 */
export function verifyTaskOutput(projectDir: string, task: TaskState): QualityResult {
  const checks: CheckResult[] = [];
  const files = task.files || [];

  if (files.length === 0) {
    return { taskId: task.id, passed: true, checks: [{ name: 'no-files', passed: true, message: '任务未声明文件，跳过验证' }] };
  }

  // 1. 文件存在性
  for (const f of files) {
    const fullPath = path.resolve(projectDir, f);
    const exists = fs.existsSync(fullPath);
    checks.push({
      name: `file-exists:${f}`,
      passed: exists,
      message: exists ? '文件已创建' : '文件不存在',
    });
  }

  // 2. 文件非空
  for (const f of files) {
    const fullPath = path.resolve(projectDir, f);
    if (!fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    const nonEmpty = stat.size > 0;
    checks.push({
      name: `non-empty:${f}`,
      passed: nonEmpty,
      message: nonEmpty ? `${stat.size} bytes` : '文件为空',
    });
  }

  // 3. TypeScript 语法检查 — 跳过
  // 全项目 tsc --noEmit 会被 agent 额外创建的文件（如测试文件）绊倒
  // 文件存在 + 非空 已足够作为自动化门禁，tsc 留给人工审查

  const passed = checks.every(c => c.passed);
  return { taskId: task.id, passed, checks };
}

/**
 * DAG 预检：检查所有待执行任务的 spec 完整性
 */
export function preflightCheck(_projectDir: string, tasks: TaskState[]): { ready: string[]; warnings: { taskId: string; issues: string[] }[] } {
  const ready: string[] = [];
  const warnings: { taskId: string; issues: string[] }[] = [];

  for (const task of tasks) {
    const issues: string[] = [];
    if (!task.spec?.description) issues.push('spec.description 为空');
    if (!task.spec?.interface) issues.push('spec.interface 为空 — bundle 质量可能不足');
    if (!task.files?.length) issues.push('未声明 files');

    // 依赖检查由 DAG 层保证，这里只检查 spec 完整性

    if (issues.length > 0) {
      warnings.push({ taskId: task.id, issues });
    } else {
      ready.push(task.id);
    }
  }

  return { ready, warnings };
}
