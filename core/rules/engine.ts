import type { TaskState, HarnessConfig } from '../types.js';

export interface RuleContext {
  projectDir: string;
  task?: TaskState;
  tasks?: TaskState[];
  config: HarnessConfig;
  files?: string[];  // files being committed/changed
}

export type RuleSeverity = 'error' | 'warning' | 'info';

export interface RuleResult {
  ruleId: string;
  passed: boolean;
  severity: RuleSeverity;
  message: string;
  details?: string;
}

export interface Rule {
  id: string;
  name: string;
  severity: RuleSeverity;
  check(ctx: RuleContext): RuleResult;
}

// Registry of all rules
const rules: Rule[] = [];

export function registerRule(rule: Rule): void {
  rules.push(rule);
}

export function listRules(): { id: string; name: string; severity: RuleSeverity }[] {
  return rules.map(r => ({ id: r.id, name: r.name, severity: r.severity }));
}

export function checkRules(ctx: RuleContext, ruleIds?: string[]): RuleResult[] {
  const toRun = ruleIds
    ? rules.filter(r => ruleIds.includes(r.id))
    : rules;
  return toRun.map(r => r.check(ctx));
}

export function checkRulesSummary(results: RuleResult[]): { passed: number; failed: number; warnings: number; allPassed: boolean } {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed && r.severity === 'error').length;
  const warnings = results.filter(r => !r.passed && r.severity === 'warning').length;
  return { passed, failed, warnings, allPassed: failed === 0 };
}
