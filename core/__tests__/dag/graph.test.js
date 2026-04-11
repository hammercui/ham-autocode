// core/__tests__/dag/graph.test.js
const { topoSort } = require('../../dag/graph');
const { nextWave, dagStats } = require('../../dag/scheduler');
const assert = require('assert');

// topoSort test
const tasks = [
  { id: 'a', blockedBy: [] },
  { id: 'b', blockedBy: ['a'] },
  { id: 'c', blockedBy: ['a'] },
  { id: 'd', blockedBy: ['b', 'c'] },
];
const { sorted, cycles } = topoSort(tasks);
assert.strictEqual(sorted[0].id, 'a');
assert.strictEqual(sorted[sorted.length - 1].id, 'd');
assert.strictEqual(cycles.length, 0);

// nextWave test
const tasks2 = [
  { id: 'a', status: 'done', blockedBy: [] },
  { id: 'b', status: 'pending', blockedBy: ['a'] },
  { id: 'c', status: 'pending', blockedBy: ['a'] },
  { id: 'd', status: 'pending', blockedBy: ['b'] },
];
const wave = nextWave(tasks2);
assert.strictEqual(wave.length, 2); // b and c
assert.ok(wave.find(t => t.id === 'b'));
assert.ok(wave.find(t => t.id === 'c'));

// dagStats test
const stats = dagStats(tasks2);
assert.strictEqual(stats.total, 4);
assert.strictEqual(stats.done, 1);
assert.strictEqual(stats.progress, 25);

console.log('DAG tests passed');
