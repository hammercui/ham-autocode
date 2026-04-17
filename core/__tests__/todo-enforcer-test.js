/**
 * todo-enforcer tests — v4.1 L2.5 "declared files must have real content".
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { enforceTodos } = require('../../dist/quality/todo-enforcer.js');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'todo-enforcer-'));
}
function cleanup(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }

// Case 1: all declared files have real code → pass
{
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export function a() { return 1; }\n');
    fs.writeFileSync(path.join(dir, 'b.ts'), 'export const b = 42;\nimport foo from "x";\n');
    const r = enforceTodos(dir, ['a.ts', 'b.ts']);
    assert.strictEqual(r.ok, true, `expected pass, got: ${r.reason}`);
  } finally { cleanup(dir); }
}

// Case 2: declared file missing → fail
{
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export const x = 1;\n');
    const r = enforceTodos(dir, ['a.ts', 'b.ts']);
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.missing, ['b.ts']);
  } finally { cleanup(dir); }
}

// Case 3: empty file → fail
{
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'a.ts'), '');
    const r = enforceTodos(dir, ['a.ts']);
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.empty, ['a.ts']);
  } finally { cleanup(dir); }
}

// Case 4: only whitespace → fail (empty after strip)
{
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'a.ts'), '\n\n   \t\n');
    const r = enforceTodos(dir, ['a.ts']);
    assert.strictEqual(r.ok, false);
    assert.ok(r.empty.includes('a.ts'));
  } finally { cleanup(dir); }
}

// Case 5: ts file with only comments → fail (no meaningful construct)
{
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'a.ts'), '// TODO: implement\n// placeholder\n// later\n// maybe\n');
    const r = enforceTodos(dir, ['a.ts']);
    assert.strictEqual(r.ok, false);
    assert.ok(r.trivial.includes('a.ts'));
  } finally { cleanup(dir); }
}

// Case 6: non-code file just needs > MIN_BYTES
{
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'README.md'), '# Title\n\nThis is a readme file with enough content.\n');
    const r = enforceTodos(dir, ['README.md']);
    assert.strictEqual(r.ok, true, `md with content should pass, got: ${r.reason}`);
  } finally { cleanup(dir); }
}

// Case 7: json config file passes if non-empty (no code pattern required)
{
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'config.json'), '{"key":"value","nested":{"a":1}}\n');
    const r = enforceTodos(dir, ['config.json']);
    assert.strictEqual(r.ok, true);
  } finally { cleanup(dir); }
}

// Case 8: import-only file counts as meaningful
{
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'barrel.ts'), 'import { x } from "./x";\nimport { y } from "./y";\n');
    const r = enforceTodos(dir, ['barrel.ts']);
    assert.strictEqual(r.ok, true);
  } finally { cleanup(dir); }
}

// Case 9: empty declared list → trivially passes
{
  const dir = mkTempDir();
  try {
    const r = enforceTodos(dir, []);
    assert.strictEqual(r.ok, true);
  } finally { cleanup(dir); }
}

// Case 10: mixed — one ok, one missing, one empty
{
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export function alpha() { return "hello"; }\n');
    fs.writeFileSync(path.join(dir, 'c.ts'), '\n');
    const r = enforceTodos(dir, ['a.ts', 'b.ts', 'c.ts']);
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.missing, ['b.ts']);
    assert.deepStrictEqual(r.empty, ['c.ts']);
  } finally { cleanup(dir); }
}

console.log('todo-enforcer tests passed');
