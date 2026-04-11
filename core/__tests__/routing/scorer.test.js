// core/__tests__/routing/scorer.test.js
const { scoreSpec, scoreComplexity, scoreIsolation, scoreTask } = require('../../../dist/routing/scorer');
const { routeTask } = require('../../../dist/routing/router');
const assert = require('assert');

// scoreSpec tests
assert.strictEqual(scoreSpec({}), 0);
assert.strictEqual(scoreSpec({ spec: { description: 'foo' } }), 30);
assert.strictEqual(scoreSpec({ spec: { description: 'foo', interface: 'bar', acceptance: 'baz' } }), 100);
assert.strictEqual(scoreSpec({ spec: { completeness: 85 } }), 85);

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

// routeTask tests
const codexTask = {
  id: 't1',
  files: ['single.js'],
  blockedBy: [],
  spec: { completeness: 90 },
};
const routing = routeTask(codexTask, [codexTask], '.');
assert.strictEqual(routing.target, 'codex');
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
