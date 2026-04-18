/**
 * v4.2 patchGitignore tests — 幂等性 + blanket 冲突处理 + 新建文件。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { patchGitignore } = require('../../dist/commands/cmd-migrate.js');

function mkTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gi-patch-'));
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

// Case 1: 无 .gitignore → 创建 + 写入 block
{
  const dir = mkTempProject();
  try {
    const r = patchGitignore(dir, false);
    assert.strictEqual(r.patched, true);
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    assert.ok(content.includes('ham-autocode v4.1 allowlist'));
    assert.ok(content.includes('.ham-autocode/*'));
    assert.ok(content.includes('!.ham-autocode/state/tasks/*.json'));
  } finally { cleanup(dir); }
}

// Case 2: 已有 .gitignore 无 sentinel → 追加 block
{
  const dir = mkTempProject();
  try {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ndist/\n');
    const r = patchGitignore(dir, false);
    assert.strictEqual(r.patched, true);
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    assert.ok(content.startsWith('node_modules/\ndist/'));
    assert.ok(content.includes('ham-autocode v4.1 allowlist'));
  } finally { cleanup(dir); }
}

// Case 3: 幂等 — 第二次调用不重复写入
{
  const dir = mkTempProject();
  try {
    patchGitignore(dir, false);
    const first = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    const r = patchGitignore(dir, false);
    assert.strictEqual(r.patched, false);
    assert.strictEqual(r.reason, 'already patched');
    const second = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    assert.strictEqual(first, second);
  } finally { cleanup(dir); }
}

// Case 4: 冲突 blanket `.ham-autocode/` → 自动注释掉
{
  const dir = mkTempProject();
  try {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n.ham-autocode/\ndist/\n');
    const r = patchGitignore(dir, false);
    assert.strictEqual(r.patched, true);
    assert.ok(r.commentedOut && r.commentedOut.includes('.ham-autocode/'));
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    // 原 blanket 行被注释
    assert.ok(/^#\s+\.ham-autocode\//m.test(content), 'blanket should be commented out');
    // allowlist 块追加
    assert.ok(content.includes('ham-autocode v4.1 allowlist'));
  } finally { cleanup(dir); }
}

// Case 5: 不匹配 `.ham-autocode-backup/` 这种 — 不误伤
{
  const dir = mkTempProject();
  try {
    fs.writeFileSync(path.join(dir, '.gitignore'), '.ham-autocode-backup/\n.ham-autocodex/\n');
    const r = patchGitignore(dir, false);
    assert.strictEqual(r.patched, true);
    assert.strictEqual((r.commentedOut || []).length, 0);
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    assert.ok(content.includes('.ham-autocode-backup/'));
    assert.ok(!/^#\s+\.ham-autocode-backup/m.test(content));
  } finally { cleanup(dir); }
}

// Case 6: dry-run — 不写文件
{
  const dir = mkTempProject();
  try {
    const r = patchGitignore(dir, true);
    assert.strictEqual(r.patched, true);
    assert.ok(r.reason.startsWith('would'));
    assert.strictEqual(fs.existsSync(path.join(dir, '.gitignore')), false);
  } finally { cleanup(dir); }
}

console.log('gitignore-patch tests passed');
