/**
 * hashline tests — v4.1 L0.5 collateral damage detection.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { snapshot, verify } = require('../../dist/quality/hashline.js');

function mkTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashline-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email test@test.com', { cwd: dir });
  execSync('git config user.name test', { cwd: dir });
  fs.writeFileSync(path.join(dir, 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(dir, 'b.ts'), 'export const b = 2;\n');
  execSync('git add -A && git commit -q -m init', { cwd: dir });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// Case 1: agent touched only declared files → pass
{
  const dir = mkTempRepo();
  try {
    const pre = snapshot(dir, ['a.ts']);
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export const a = 99;\n');
    const r = verify(dir, pre, ['a.ts']);
    assert.strictEqual(r.ok, true, `should pass, got: ${r.reason}`);
    assert.deepStrictEqual(r.actuallyTouched, ['a.ts']);
    assert.strictEqual(r.collateralDamage.length, 0);
  } finally { cleanup(dir); }
}

// Case 2: agent touched undeclared neighbor → FAIL
{
  const dir = mkTempRepo();
  try {
    const pre = snapshot(dir, ['a.ts']);
    fs.writeFileSync(path.join(dir, 'a.ts'), 'modified\n');
    fs.writeFileSync(path.join(dir, 'b.ts'), 'collateral damage\n');
    const r = verify(dir, pre, ['a.ts']);
    assert.strictEqual(r.ok, false, 'should detect collateral');
    assert.ok(r.collateralDamage.includes('b.ts'), `expected b.ts in collateral, got ${r.collateralDamage}`);
  } finally { cleanup(dir); }
}

// Case 3: agent created new file declared → pass
{
  const dir = mkTempRepo();
  try {
    const pre = snapshot(dir, ['c.ts']);
    fs.writeFileSync(path.join(dir, 'c.ts'), 'new file\n');
    const r = verify(dir, pre, ['c.ts']);
    assert.strictEqual(r.ok, true, `new declared file should pass, got: ${r.reason}`);
  } finally { cleanup(dir); }
}

// Case 4: agent created undeclared file → FAIL
{
  const dir = mkTempRepo();
  try {
    const pre = snapshot(dir, ['a.ts']);
    fs.writeFileSync(path.join(dir, 'a.ts'), 'edited\n');
    fs.writeFileSync(path.join(dir, 'sneaky.ts'), 'unauthorized\n');
    const r = verify(dir, pre, ['a.ts']);
    assert.strictEqual(r.ok, false);
    assert.ok(r.collateralDamage.includes('sneaky.ts'));
  } finally { cleanup(dir); }
}

// Case 5: directory prefix match
{
  const dir = mkTempRepo();
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    const pre = snapshot(dir, ['src/']);
    fs.writeFileSync(path.join(dir, 'src', 'x.ts'), 'foo\n');
    fs.writeFileSync(path.join(dir, 'src', 'y.ts'), 'bar\n');
    const r = verify(dir, pre, ['src/']);
    assert.strictEqual(r.ok, true, `prefix match should pass, got: ${r.reason}`);
  } finally { cleanup(dir); }
}

// Case 6: non-git dir falls back to mtime mode
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashline-nogit-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.ts'), 'v1\n');
    const pre = snapshot(dir, ['a.ts']);
    assert.strictEqual(pre.kind, 'mtime');
    // mtime mode cannot detect collateral; should always ok
    const r = verify(dir, pre, ['a.ts']);
    assert.strictEqual(r.ok, true);
  } finally { cleanup(dir); }
}

// Case 7: pre-existing uncommitted changes are not counted as this-run collateral
{
  const dir = mkTempRepo();
  try {
    fs.writeFileSync(path.join(dir, 'b.ts'), 'pre-modified by previous run\n');
    const pre = snapshot(dir, ['a.ts']);
    assert.ok(pre.changedFiles.has('b.ts'), 'b.ts already modified pre-snapshot');
    fs.writeFileSync(path.join(dir, 'a.ts'), 'new edit\n');
    const r = verify(dir, pre, ['a.ts']);
    assert.strictEqual(r.ok, true, 'b.ts pre-existing dirty state should not count');
    assert.ok(!r.collateralDamage.includes('b.ts'));
  } finally { cleanup(dir); }
}

// Case 8: concurrent wave — peer's declared files should NOT be collateral
{
  const dir = mkTempRepo();
  try {
    const pre = snapshot(dir, ['a.ts']);
    // simulate two concurrent tasks:
    // task-A declared a.ts, task-B declared b.ts, both executed in same wave
    fs.writeFileSync(path.join(dir, 'a.ts'), 'A edit\n');
    fs.writeFileSync(path.join(dir, 'b.ts'), 'B edit by peer\n');
    // task-A verify: declared = a.ts + peer(b.ts)
    const r = verify(dir, pre, ['a.ts', 'b.ts']);
    assert.strictEqual(r.ok, true, `peer-declared file should not be collateral: ${r.reason}`);
  } finally { cleanup(dir); }
}

console.log('hashline tests passed');
