/**
 * v4.2: rules/engine.ts 拍扁 — 之前 51 行引擎包装 155 行规则的 3:1 抽象。
 * 现在合并为一个文件：类型 + 规则数组 + 三个查询函数。
 * 外部 API 保持不变：listRules / checkRules / checkRulesSummary。
 */
import fs from 'fs';
import path from 'path';
import type { TaskState, HarnessConfig } from '../types.js';

// ─── Types ──────────────────────────────────────────────────

export type RuleSeverity = 'error' | 'warning' | 'info';

export interface RuleContext {
  projectDir: string;
  task?: TaskState;
  tasks?: TaskState[];
  config: HarnessConfig;
  files?: string[];  // files being committed/changed
}

export interface RuleResult {
  ruleId: string;
  passed: boolean;
  severity: RuleSeverity;
  message: string;
  details?: string;
}

interface Rule {
  id: string;
  name: string;
  severity: RuleSeverity;
  check(ctx: RuleContext): RuleResult;
}

// ─── Rule Definitions ───────────────────────────────────────

const RULES: Rule[] = [
  // R01: 单文件不超过 500 行
  {
    id: 'R01', name: 'file-line-limit', severity: 'warning',
    check(ctx) {
      const violations: string[] = [];
      for (const file of (ctx.files || [])) {
        try {
          const lines = fs.readFileSync(path.resolve(ctx.projectDir, file), 'utf8').split('\n').length;
          if (lines > 500) violations.push(`${file}: ${lines} lines`);
        } catch { /* file may not exist */ }
      }
      return {
        ruleId: 'R01', passed: violations.length === 0, severity: 'warning',
        message: violations.length === 0 ? 'All files under 500 lines' : `${violations.length} files exceed 500 lines`,
        details: violations.join(', '),
      };
    },
  },

  // R02: 每次 commit 不超过 10 个文件
  {
    id: 'R02', name: 'commit-file-limit', severity: 'warning',
    check(ctx) {
      const count = (ctx.files || []).length;
      return {
        ruleId: 'R02', passed: count <= 10, severity: 'warning',
        message: count <= 10 ? `${count} files (within limit)` : `${count} files exceed 10-file limit`,
      };
    },
  },

  // R03: 测试覆盖率不低于当前值 — 简化版：检查是否有测试文件
  {
    id: 'R03', name: 'test-coverage-guard', severity: 'warning',
    check(ctx) {
      const files = ctx.files || [];
      const srcFiles = files.filter(f => !f.includes('test') && !f.includes('__tests__') && (f.endsWith('.ts') || f.endsWith('.js')));
      const testFiles = files.filter(f => f.includes('test') || f.includes('__tests__'));
      const hasTests = testFiles.length > 0 || srcFiles.length === 0;
      return {
        ruleId: 'R03', passed: hasTests, severity: 'warning',
        message: hasTests ? 'Test files present or no source changes' : `${srcFiles.length} source files changed without tests`,
      };
    },
  },

  // R04: 不允许 TODO/FIXME 进入 done 状态
  {
    id: 'R04', name: 'no-todo-in-done', severity: 'warning',
    check(ctx) {
      if (!ctx.task || ctx.task.status !== 'done') {
        return { ruleId: 'R04', passed: true, severity: 'warning', message: 'Task not done, skip' };
      }
      const violations: string[] = [];
      for (const file of (ctx.task.files || [])) {
        try {
          const content = fs.readFileSync(path.resolve(ctx.projectDir, file), 'utf8');
          const matches = content.match(/\b(TODO|FIXME|HACK|XXX)\b/gi);
          if (matches && matches.length > 0) violations.push(`${file}: ${matches.length} markers`);
        } catch { /* file may not exist */ }
      }
      return {
        ruleId: 'R04', passed: violations.length === 0, severity: 'warning',
        message: violations.length === 0 ? 'No TODO/FIXME in done task files' : `${violations.length} files have TODO/FIXME markers`,
        details: violations.join(', '),
      };
    },
  },

  // R05: import 路径必须存在
  {
    id: 'R05', name: 'import-path-exists', severity: 'error',
    check(ctx) {
      const violations: string[] = [];
      for (const file of (ctx.files || [])) {
        if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;
        const fullPath = path.resolve(ctx.projectDir, file);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const importRegex = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
          let match: RegExpExecArray | null;
          while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            const resolved = path.resolve(path.dirname(fullPath), importPath);
            // Check .ts, .js, /index.ts, /index.js, plus .js→.ts (Node16 resolution)
            const candidates = [
              resolved, resolved + '.ts', resolved + '.js',
              path.join(resolved, 'index.ts'), path.join(resolved, 'index.js'),
              resolved.replace(/\.js$/, '.ts'),
            ];
            if (!candidates.some(c => fs.existsSync(c))) violations.push(`${file}: ${importPath}`);
          }
        } catch { /* file may not exist */ }
      }
      return {
        ruleId: 'R05', passed: violations.length === 0, severity: 'error',
        message: violations.length === 0 ? 'All import paths resolve' : `${violations.length} broken imports`,
        details: violations.join(', '),
      };
    },
  },

  // R06: 敏感文件保护
  {
    id: 'R06', name: 'sensitive-file-guard', severity: 'error',
    check(ctx) {
      const sensitivePatterns = ['.env', 'credentials', '.secret', '.key', '.pem', 'id_rsa'];
      const violations = (ctx.files || []).filter(f => {
        const base = path.basename(f).toLowerCase();
        return sensitivePatterns.some(p => base.includes(p));
      });
      return {
        ruleId: 'R06', passed: violations.length === 0, severity: 'error',
        message: violations.length === 0 ? 'No sensitive files detected' : `${violations.length} sensitive files in changeset`,
        details: violations.join(', '),
      };
    },
  },

  // R07: context 预算不超过 critical 阈值
  {
    id: 'R07', name: 'context-budget-guard', severity: 'error',
    check(ctx) {
      const threshold = ctx.config.context?.criticalThreshold || 70;
      return {
        ruleId: 'R07', passed: true, severity: 'error',
        message: `Context budget guard (threshold: ${threshold}%) — use 'context budget' for live check`,
      };
    },
  },

  // R08: 失败任务不超过 20%
  {
    id: 'R08', name: 'failure-rate-guard', severity: 'error',
    check(ctx) {
      const tasks = ctx.tasks || [];
      if (tasks.length === 0) return { ruleId: 'R08', passed: true, severity: 'error', message: 'No tasks to check' };
      const failed = tasks.filter(t => t.status === 'failed').length;
      const rate = Math.round(failed / tasks.length * 100);
      const passed = rate <= 20;
      return {
        ruleId: 'R08', passed, severity: 'error',
        message: passed
          ? `Failure rate: ${rate}% (within 20% limit)`
          : `Failure rate: ${rate}% exceeds 20% limit — consider pausing pipeline`,
      };
    },
  },
];

// ─── Public API ─────────────────────────────────────────────

export function listRules(): { id: string; name: string; severity: RuleSeverity }[] {
  return RULES.map(r => ({ id: r.id, name: r.name, severity: r.severity }));
}

export function checkRules(ctx: RuleContext, ruleIds?: string[]): RuleResult[] {
  const toRun = ruleIds ? RULES.filter(r => ruleIds.includes(r.id)) : RULES;
  return toRun.map(r => r.check(ctx));
}

export function checkRulesSummary(results: RuleResult[]): { passed: number; failed: number; warnings: number; allPassed: boolean } {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed && r.severity === 'error').length;
  const warnings = results.filter(r => !r.passed && r.severity === 'warning').length;
  return { passed, failed, warnings, allPassed: failed === 0 };
}
