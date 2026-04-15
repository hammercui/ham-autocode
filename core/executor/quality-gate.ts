/**
 * 多层质量门禁
 *
 * L0: 文件存在 + 非空 (每个任务)
 * L1: TypeScript 单文件语法检查 — 只检查变更的 .ts/.tsx 文件 (每个任务)
 * L2: spec.acceptance 关键词验证 — 检查 export 是否包含 spec 要求的接口 (每个任务)
 * L3: 项目级 tsc --noEmit — 全量类型检查 (每波 commit 前)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
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
 * 验证任务产出质量 (L0 + L1 + L2)
 */
export function verifyTaskOutput(projectDir: string, task: TaskState): QualityResult {
  const checks: CheckResult[] = [];
  const files = task.files || [];

  if (files.length === 0) {
    return { taskId: task.id, passed: true, checks: [{ name: 'no-files', passed: true, message: '任务未声明文件，跳过验证' }] };
  }

  // L0: 文件存在性
  for (const f of files) {
    const fullPath = path.resolve(projectDir, f);
    const exists = fs.existsSync(fullPath);
    checks.push({
      name: `file-exists:${f}`,
      passed: exists,
      message: exists ? '文件已创建' : '文件不存在',
    });
  }

  // L0: 文件非空
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

  // L1: TypeScript 单文件语法检查（只对 .ts/.tsx 文件）
  const tsFiles = files.filter(f => /\.tsx?$/.test(f));
  if (tsFiles.length > 0) {
    const tsconfig = findTsConfig(projectDir);
    if (tsconfig) {
      for (const f of tsFiles) {
        const fullPath = path.resolve(projectDir, f);
        if (!fs.existsSync(fullPath)) continue;
        const result = checkTsSyntax(fullPath, tsconfig);
        checks.push({
          name: `ts-syntax:${f}`,
          passed: result.passed,
          message: result.passed ? 'TypeScript 语法正常' : result.error,
        });
      }
    }
  }

  // L2: spec.acceptance 关键词验证 — 检查 spec 中声明的 export 是否存在于产出文件中
  const specChecks = verifySpecKeywords(projectDir, task);
  checks.push(...specChecks);

  const passed = checks.every(c => c.passed);
  return { taskId: task.id, passed, checks };
}

/**
 * L3: 项目级 tsc --noEmit (每波 commit 前调用)
 * 返回 passed + 错误摘要。单独暴露，auto-runner 在 commitWave 前调用。
 */
export function verifyProjectTsc(projectDir: string): { passed: boolean; errors: string[] } {
  const tsconfig = findTsConfig(projectDir);
  if (!tsconfig) return { passed: true, errors: [] };

  const tsconfigDir = path.dirname(tsconfig);
  try {
    execSync('npx tsc --noEmit', {
      cwd: tsconfigDir,
      stdio: 'pipe',
      timeout: 60000,
      shell: true as unknown as string,
    });
    return { passed: true, errors: [] };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    const output = ((err.stdout || '') + (err.stderr || '')).trim();
    // 只取前 5 个错误，避免输出爆炸
    const errors = output.split('\n').filter(l => l.includes('error TS')).slice(0, 5);
    return { passed: false, errors: errors.length > 0 ? errors : [output.slice(0, 500)] };
  }
}

// ==================== Helpers ====================

/** 查找最近的 tsconfig.json */
function findTsConfig(projectDir: string): string | null {
  // 优先查找子目录（如 app/tsconfig.json）
  const candidates = [
    path.join(projectDir, 'tsconfig.json'),
    path.join(projectDir, 'app', 'tsconfig.json'),
    path.join(projectDir, 'src', 'tsconfig.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** 单文件 TypeScript 语法检查 — 运行全量 tsc 但只关注当前文件的错误 */
function checkTsSyntax(filePath: string, tsconfig: string): { passed: boolean; error: string } {
  const tsconfigDir = path.dirname(tsconfig);
  try {
    execSync('npx tsc --noEmit --pretty false', {
      cwd: tsconfigDir,
      stdio: 'pipe',
      timeout: 30000,
      shell: true as unknown as string,
    });
    return { passed: true, error: '' };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    const output = ((err.stdout || '') + (err.stderr || '')).trim();
    // 只关注当前文件的错误
    const basename = path.basename(filePath);
    const relevantErrors = output.split('\n').filter(l => l.includes(basename) && l.includes('error TS'));
    if (relevantErrors.length === 0) {
      // 错误不涉及当前文件，视为通过（其他文件的已有错误不应阻塞）
      return { passed: true, error: '' };
    }
    return { passed: false, error: relevantErrors.slice(0, 3).join('\n') };
  }
}

/**
 * L2: 从 spec.interface 提取 export 名称，检查文件中是否包含
 * 例如 spec.interface = "export function safeParse<T>(...)" → 检查文件中是否有 "safeParse"
 */
function verifySpecKeywords(projectDir: string, task: TaskState): CheckResult[] {
  const iface = task.spec?.interface;
  if (!iface) return [];

  // 提取 export 的函数名/接口名/类型名
  const exportNames: string[] = [];
  const patterns = [
    /export\s+(?:function|const|let|var)\s+(\w+)/g,
    /export\s+(?:interface|type|class|enum)\s+(\w+)/g,
    /export\s+(?:async\s+)?function\s+(\w+)/g,
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(iface)) !== null) {
      if (!exportNames.includes(m[1])) exportNames.push(m[1]);
    }
  }

  if (exportNames.length === 0) return [];

  const checks: CheckResult[] = [];
  for (const f of task.files || []) {
    const fullPath = path.resolve(projectDir, f);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf-8');
    for (const name of exportNames) {
      const found = content.includes(name);
      checks.push({
        name: `spec-export:${name}@${f}`,
        passed: found,
        message: found ? `找到 "${name}"` : `未找到 spec 声明的 "${name}"`,
      });
    }
  }

  return checks;
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
