/**
 * spec-lint tests — v4.1 Spec Prompt 压缩的门禁验证。
 */
const assert = require('assert');
const { lintSpec, buildLintFeedback } = require('../../dist/spec/spec-lint.js');

// Case 1: compliant spec passes
{
  const ok = lintSpec({
    description: '生成用户注册接口',
    interface: 'export function register(u: User): Promise<Token>',
    acceptance: '返回 Token;邮箱唯一;密码加密',
    files: ['src/auth/register.ts'],
    complexity: 30,
  });
  assert.strictEqual(ok.ok, true, `compliant spec should pass, got: ${JSON.stringify(ok.violations)}`);
  assert.ok(ok.totalTokens <= 200, 'total tokens under cap');
}

// Case 2: description too long
{
  const r = lintSpec({
    description: 'A'.repeat(100),
    interface: 'f(): void',
    acceptance: 'A;B;C',
    files: ['x.ts'],
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.violations.some(v => v.rule === 'R1-description-length'));
}

// Case 3: acceptance not 3 clauses
{
  const r = lintSpec({
    description: 'test',
    interface: 'f(): void',
    acceptance: 'A;B',
    files: ['x.ts'],
  });
  assert.ok(r.violations.some(v => v.rule === 'R2-acceptance-count'));
}

// Case 4: empty files
{
  const r = lintSpec({
    description: 'test',
    interface: 'f(): void',
    acceptance: 'A;B;C',
    files: [],
  });
  assert.ok(r.violations.some(v => v.rule === 'R3-files-empty'));
}

// Case 5: interface has comments
{
  const r = lintSpec({
    description: 'test',
    interface: 'f(): void // returns void',
    acceptance: 'A;B;C',
    files: ['x.ts'],
  });
  assert.ok(r.violations.some(v => v.rule === 'R4-interface-no-comments'));
}

// Case 6: feedback prompt contains rule names
{
  const r = lintSpec({ description: 'A'.repeat(100), interface: '', acceptance: 'A', files: [] });
  const fb = buildLintFeedback(r);
  assert.ok(fb.includes('R1-description-length'));
  assert.ok(fb.includes('R2-acceptance-count'));
  assert.ok(fb.includes('R3-files-empty'));
}

// Case 7: empty spec → violation but no crash
{
  const r = lintSpec({});
  assert.strictEqual(r.ok, false);
  assert.ok(r.violations.length >= 3);
}

console.log('spec-lint tests passed');
