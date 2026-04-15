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
 * DAG 预检：检查所有待执行任务的 spec 完整性 + 质量评分
 */
export function preflightCheck(_projectDir: string, tasks: TaskState[]): { ready: string[]; warnings: { taskId: string; issues: string[] }[] } {
  const ready: string[] = [];
  const warnings: { taskId: string; issues: string[] }[] = [];

  for (const task of tasks) {
    const issues: string[] = [];

    // 基础完整性检查
    const isRuntimeAdded = task.routing?.reason?.startsWith('runtime-added');
    if (!task.spec?.description) issues.push('spec.description 为空');
    // runtime-added 任务（dag add）通常没有 interface，不发 warning
    if (!task.spec?.interface && !isRuntimeAdded) issues.push('spec.interface 为空 — bundle 质量可能不足');
    if (!task.files?.length) issues.push('未声明 files');

    // codexfake 路由的中高复杂度任务 — spec 质量强化检查
    const isCodexfake = task.routing?.target === 'codexfake';
    const isComplex = (task.scores?.complexityScore ?? 0) >= 30;
    if (isCodexfake || isComplex) {
      const specIssues = checkSpecQuality(task);
      issues.push(...specIssues);
    }

    if (issues.length > 0) {
      warnings.push({ taskId: task.id, issues });
    } else {
      ready.push(task.id);
    }
  }

  return { ready, warnings };
}

/**
 * Spec 质量检查（针对 codexfake / 中高复杂度任务）
 * 检测 spec 是否缺少关键实现细节，避免 agent 自行补全出错。
 */
function checkSpecQuality(task: TaskState): string[] {
  const issues: string[] = [];
  const desc = task.spec?.description || '';
  const iface = task.spec?.interface || '';
  const acceptance = task.spec?.acceptance || '';

  // 1. description 长度：中等任务至少 80 字符
  if (desc.length < 80) {
    issues.push(`spec.description 过短 (${desc.length} chars) — codexfake 任务建议 ≥80 字符`);
  }

  // 2. acceptance 条目数：至少 3 条
  const acceptanceItems = acceptance.split(/\d+[.、)]\s*/).filter(Boolean);
  if (acceptanceItems.length < 3) {
    issues.push(`spec.acceptance 条目不足 (${acceptanceItems.length}) — 建议 ≥3 条验收标准`);
  }

  // 3. interface 声明的参数 vs description 中的提及
  // 如果 interface 有参数名，description 应该提及如何使用
  const paramNames = extractParamNames(iface);
  const missingParams = paramNames.filter(p => !desc.includes(p) && p.length > 2);
  if (missingParams.length > 0) {
    issues.push(`spec.interface 声明了参数 [${missingParams.join(', ')}] 但 description 未说明用法`);
  }

  // 4. 依赖模块使用说明
  const deps = task.blockedBy || [];
  const requiredFiles = task.context?.requiredFiles || [];
  if ((deps.length > 0 || requiredFiles.length > 1) && !desc.includes('导入') && !desc.includes('import') && !desc.includes('调用')) {
    issues.push('任务有依赖但 description 未说明如何导入/调用依赖模块');
  }

  return issues;
}

/** 从 interface 签名中提取参数名 */
function extractParamNames(iface: string): string[] {
  const names: string[] = [];
  // 匹配函数参数: (argName: Type, argName2: Type)
  const funcMatch = iface.match(/\(([^)]*)\)/);
  if (funcMatch) {
    const params = funcMatch[1].split(',');
    for (const p of params) {
      const nameMatch = p.trim().match(/^(\w+)\s*[?:]/)
      if (nameMatch && nameMatch[1] !== 'args') names.push(nameMatch[1]);
    }
  }
  return names;
}
