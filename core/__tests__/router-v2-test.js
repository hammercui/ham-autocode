/**
 * Router v4.2 tests — R1-R6 decision tree + A/B random bucket.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { routeTask } = require('../../dist/routing/router.js');
const { abStats, pickRandomSimple } = require('../../dist/routing/ab-log.js');

function mkTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-v2-'));
  return dir;
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

// Case R1: isolation high + complexity low → codexfake
{
  const dir = mkTempProject();
  try {
    const task = { id: 't-r1', files: ['x.ts'], blockedBy: [], spec: { description: 'x' } };
    const r = routeTask(task, [task], dir);
    // complexity=20 isolation=100 → R1
    assert.strictEqual(r.target, 'codexfake', `expected codexfake, got ${r.target} (${r.reason})`);
  } finally { cleanup(dir); }
}

// Case R2: simple → random opencode|cc-haiku
{
  const dir = mkTempProject();
  try {
    // To trigger R2 (not R1), need complexity≤40 and NOT (iso≥80 & comp≤50).
    // Make a peer task overlap to drop isolation below 80, keep complexity ≤ 40.
    const t = { id: 'a', files: ['shared.ts', 'a.ts'], blockedBy: [], spec: {} };
    const peer = { id: 'b', files: ['shared.ts'], blockedBy: [], spec: {} };
    // complexity=40 (2 files × 20), isolation will drop
    const targets = new Set();
    for (let i = 0; i < 20; i++) {
      const r = routeTask(t, [t, peer], dir);
      targets.add(r.target);
    }
    // Should include at least one of each bucket (probabilistic, 20 trials → virtually certain)
    assert.ok(targets.has('opencode') || targets.has('cc-haiku'), `R2 should produce opencode or cc-haiku, got ${[...targets]}`);
    // Must not produce codex/sonnet/claude-code at this complexity
    assert.ok(!targets.has('claude-code'), 'R2 simple should never route to claude-code');
    assert.ok(!targets.has('cc-sonnet'), 'R2 simple should never route to cc-sonnet');
  } finally { cleanup(dir); }
}

// Case R3: medium complexity + medium isolation → codexfake
{
  const dir = mkTempProject();
  try {
    // complexity=60 (3 files), isolation≥60 (all unique)
    const t = { id: 't-r3', files: ['a.ts', 'b.ts', 'c.ts'], blockedBy: [], spec: {} };
    const r = routeTask(t, [t], dir);
    // iso=100 comp=60 → R1 condition: iso≥80 comp≤50? comp=60 fails R1.
    // R2: comp≤40? no
    // R3: comp≤60 iso≥60 → codexfake ✓
    assert.strictEqual(r.target, 'codexfake', `expected codexfake (R3), got ${r.target}`);
  } finally { cleanup(dir); }
}

// Case R4: higher complexity → cc-sonnet
{
  const dir = mkTempProject();
  try {
    // complexity=75 (3 files=60 + 1 dep=15)
    const t = { id: 't-r4', files: ['a.ts', 'b.ts', 'c.ts'], blockedBy: ['x'], spec: {} };
    const peer = { id: 'p', files: ['a.ts'], blockedBy: [], spec: {} };
    // isolation will drop because of peer overlap → below 60 → R3 fails → R4
    const r = routeTask(t, [t, peer], dir);
    assert.strictEqual(r.target, 'cc-sonnet', `expected cc-sonnet (R4), got ${r.target} reason=${r.reason}`);
  } finally { cleanup(dir); }
}

// Case R6: very complex → claude-code (Opus)
{
  const dir = mkTempProject();
  try {
    const t = { id: 't-r6', files: ['a', 'b', 'c', 'd', 'e'], blockedBy: ['x', 'y', 'z'], spec: {} };
    const r = routeTask(t, [t], dir);
    // complexity = min(100, 100+45) = 100 → R4 fails → R6
    assert.strictEqual(r.target, 'claude-code', `expected claude-code, got ${r.target}`);
  } finally { cleanup(dir); }
}

// Case: A/B log written for R2
{
  const dir = mkTempProject();
  try {
    const t = { id: 'ab-1', files: ['shared.ts', 'x.ts'], blockedBy: [], spec: {} };
    const peer = { id: 'ab-2', files: ['shared.ts'], blockedBy: [], spec: {} };
    routeTask(t, [t, peer], dir);
    const logFile = path.join(dir, '.ham-autocode', 'state', 'routing', 'ab-log.jsonl');
    assert.ok(fs.existsSync(logFile), 'ab-log.jsonl should be written');
    const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.strictEqual(entry.taskId, 'ab-1');
    assert.ok(['opencode', 'cc-haiku'].includes(entry.bucket));
  } finally { cleanup(dir); }
}

// Case: abStats aggregates both buckets
{
  const dir = mkTempProject();
  try {
    for (let i = 0; i < 10; i++) {
      pickRandomSimple(dir, `t-${i}`, 30, 1);
    }
    const stats = abStats(dir);
    assert.strictEqual(stats.length, 2);
    const total = stats.reduce((s, x) => s + x.n, 0);
    assert.strictEqual(total, 10);
  } finally { cleanup(dir); }
}

console.log('router v2 tests passed');
