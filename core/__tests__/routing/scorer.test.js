// core/__tests__/routing/scorer.test.js
const { scoreSpec, scoreComplexity, scoreIsolation, scoreTask } = require('../../../dist/routing/scorer');
const { routeTask } = require('../../../dist/routing/router');
const assert = require('assert');

// scoreSpec tests — v2.3 field fill-rate logic
assert.strictEqual(scoreSpec({}), 0);
// description too short (<= 20 chars) → 0; no other fields → 0
assert.strictEqual(scoreSpec({ spec: { description: 'foo' } }), 0);
// description long enough (>20) + interface + acceptance → 75; completeness missing → 75
assert.strictEqual(scoreSpec({ spec: { description: 'a]long description over twenty chars', interface: 'bar', acceptance: 'baz' } }), 75);
// completeness >= 80 → 25; other fields empty → 25
assert.strictEqual(scoreSpec({ spec: { completeness: 85 } }), 25);
// All four conditions met → 100
assert.strictEqual(scoreSpec({ spec: { description: 'a long description over twenty chars', interface: 'IFoo', acceptance: 'must pass', completeness: 90 } }), 100);

// scoreComplexity tests
assert.strictEqual(scoreComplexity({ files: ['a.js'], blockedBy: [] }), 20);
assert.strictEqual(scoreComplexity({ files: ['a.js', 'b.js', 'c.js'], blockedBy: ['x', 'y'] }), 90);
assert.strictEqual(scoreComplexity({}), 0);

// scoreIsolation tests
const tasks = [
  { id: 'a', files: ['shared.js', 'a.js'] },
  { id: 'b', files: ['shared.js', 'b.js'] },
  { id: 'c', files: ['c.js'] },
];
assert.ok(scoreIsolation(tasks[0], tasks) < 100); // shares shared.js with b
assert.strictEqual(scoreIsolation(tasks[2], tasks), 100); // c.js is unique

// routeTask tests — v2.3: all four spec fields must be filled for high specScore
const codexTask = {
  id: 't1',
  files: ['single.js'],
  blockedBy: [],
  spec: { description: 'a long description over twenty chars', interface: 'IFoo', acceptance: 'must pass', completeness: 90 },
};
const routing = routeTask(codexTask, [codexTask], '.');
assert.strictEqual(routing.target, 'codexfake');
assert.strictEqual(routing.needsConfirmation, false);

// Complex task → claude-code with confirmation
const complexTask = {
  id: 't2',
  files: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'],
  blockedBy: ['x', 'y', 'z'],
  spec: { completeness: 50 },
};
const routing2 = routeTask(complexTask, [complexTask], '.');
assert.strictEqual(routing2.target, 'claude-code');
assert.strictEqual(routing2.needsConfirmation, true);

console.log('routing tests passed');
