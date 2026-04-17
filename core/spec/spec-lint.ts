/**
 * v4.1 Spec Lint — 强制 Spec Prompt 压缩的简洁宪法。
 * 违反规则触发回炉重写；二次回炉仍失败则记入 review-feedback 留痕。
 */

export interface SpecDraft {
  description?: string;
  interface?: string;
  acceptance?: string;
  files?: string[];
  complexity?: number;
}

export interface LintViolation {
  rule: string;
  detail: string;
}

export interface LintResult {
  ok: boolean;
  violations: LintViolation[];
  totalTokens: number;
}

/** Token estimator — 与 context-template 保持一致 (≈ 4 chars/token)。 */
function tk(s: string): number {
  return Math.ceil((s || '').length / 4);
}

export function lintSpec(draft: SpecDraft): LintResult {
  const violations: LintViolation[] = [];
  const desc = draft.description || '';
  const iface = draft.interface || '';
  const accept = draft.acceptance || '';
  const files = draft.files || [];

  // R1: description ≤ 40 字（约 20 token，中文一字约 2 token 所以宽松到 30）
  if (desc.length > 60) {
    violations.push({ rule: 'R1-description-length', detail: `description ${desc.length} chars > 60 (cap: 40 CJK chars)` });
  }
  if (desc.length === 0) {
    violations.push({ rule: 'R1-description-empty', detail: 'description missing' });
  }

  // R2: acceptance 恰好 3 条（分号分隔）
  const clauses = accept.split(/[;；]/).map(s => s.trim()).filter(Boolean);
  if (clauses.length !== 3) {
    violations.push({ rule: 'R2-acceptance-count', detail: `acceptance has ${clauses.length} clauses, need exactly 3` });
  }
  for (const c of clauses) {
    if (c.length > 40) {
      violations.push({ rule: 'R2-acceptance-clause-length', detail: `clause too long (${c.length} chars): "${c.slice(0, 20)}..."` });
    }
  }

  // R3: files 非空
  if (files.length === 0) {
    violations.push({ rule: 'R3-files-empty', detail: 'files[] must not be empty' });
  }

  // R4: interface 无注释
  if (/\/\/|\/\*|\*\//.test(iface)) {
    violations.push({ rule: 'R4-interface-no-comments', detail: 'interface must not contain // or /* */ comments' });
  }

  // R5: 总 tokens ≤ 200
  const totalTokens = tk(desc) + tk(iface) + tk(accept) + tk(files.join(','));
  if (totalTokens > 200) {
    violations.push({ rule: 'R5-total-tokens', detail: `total ${totalTokens} tokens > 200` });
  }

  return { ok: violations.length === 0, violations, totalTokens };
}

/** 生成回炉反馈 prompt —— 喂给 Opus 让它重写。 */
export function buildLintFeedback(result: LintResult): string {
  if (result.ok) return '';
  const rules = result.violations.map(v => `- ${v.rule}: ${v.detail}`).join('\n');
  return `上一次输出违反 lint 规则，请修正后重新输出 JSON：\n${rules}\n\n关键约束：description ≤40 字、acceptance 恰 3 条每条 ≤20 字、interface 无注释、files 非空。`;
}
