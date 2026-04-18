/**
 * hierarchical context — v4.2 tests.
 * 单测只覆盖 contextForFiles（合成假 tree），buildTreeContext 走 smoke test 另行。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { contextForFiles } = require('../../dist/context/hierarchical.js');

function mkTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hier-ctx-'));
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

function writeTree(projectDir, entries) {
  const dir = path.join(projectDir, '.ham-autocode', 'state', 'context', 'tree');
  fs.mkdirSync(dir, { recursive: true });
  for (const [flatName, content] of Object.entries(entries)) {
    fs.writeFileSync(path.join(dir, flatName + '.md'), content);
  }
}

// Case 1: 无 tree dir → 返回空串
{
  const dir = mkTempProject();
  try {
    const r = contextForFiles(dir, ['src/foo.ts']);
    assert.strictEqual(r, '');
  } finally { cleanup(dir); }
}

// Case 2: 单文件上溯 — 包含 src 和 root 的 context
{
  const dir = mkTempProject();
  try {
    writeTree(dir, {
      _root: '# (project root)\nroot-content',
      'src': '# src\nsrc-content',
      'src_lib': '# src/lib\nlib-content',
      'src_util': '# src/util\nutil-content',  // 不相关
    });
    const r = contextForFiles(dir, ['src/lib/foo.ts']);
    assert.ok(r.includes('lib-content'), 'should include nearest dir');
    assert.ok(r.includes('src-content'), 'should include parent dir');
    assert.ok(r.includes('root-content'), 'should include root');
    assert.ok(!r.includes('util-content'), 'should not include unrelated dir');
    // 顺序：最深的 src/lib 应排在最前
    assert.ok(r.indexOf('lib-content') < r.indexOf('src-content'), 'deepest first');
    assert.ok(r.indexOf('src-content') < r.indexOf('root-content'), 'then parent, then root');
  } finally { cleanup(dir); }
}

// Case 3: 多文件 — 去重祖先
{
  const dir = mkTempProject();
  try {
    writeTree(dir, {
      _root: '# root',
      'a': '# a\naaa',
      'b': '# b\nbbb',
      'a_x': '# a/x\nax',
      'b_y': '# b/y\nby',
    });
    const r = contextForFiles(dir, ['a/x/f.ts', 'b/y/g.ts']);
    assert.ok(r.includes('ax'));
    assert.ok(r.includes('by'));
    assert.ok(r.includes('aaa'));
    assert.ok(r.includes('bbb'));
    // root 只出现一次
    const rootCount = (r.match(/# root/g) || []).length;
    assert.strictEqual(rootCount, 1);
  } finally { cleanup(dir); }
}

// Case 4: 超 TASK_CONTEXT_MAX_CHARS → 截断
{
  const dir = mkTempProject();
  try {
    const big = 'x'.repeat(8000);
    writeTree(dir, {
      _root: '# root\n' + big,
      'deep_very_deep': '# deep\n' + big,
      'deep': '# mid\n' + big,
    });
    const r = contextForFiles(dir, ['deep/very/deep/f.ts']);
    assert.ok(r.length <= 12000 + 200, `should truncate to ~12000 chars, got ${r.length}`);
    assert.ok(r.includes('truncated'), 'should mark truncation');
  } finally { cleanup(dir); }
}

// Case 5: 不存在的目录 md → 静默跳过
{
  const dir = mkTempProject();
  try {
    writeTree(dir, { _root: 'root-only' });
    const r = contextForFiles(dir, ['nonexistent/deep/nested/file.ts']);
    // root 存在，其他都没有
    assert.ok(r.includes('root-only'));
    assert.ok(r.length < 200);
  } finally { cleanup(dir); }
}

console.log('hierarchical context tests passed');
