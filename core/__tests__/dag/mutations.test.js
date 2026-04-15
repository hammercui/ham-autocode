// core/__tests__/dag/mutations.test.js — Tests for v3.9 DAG Change Management
const { getDirectDependents, getTransitiveDependents, wouldCycle } = require('../../../dist/dag/graph');
const assert = require('assert');

// ── getDirectDependents ──

const tasks = [
  { id: 'a', blockedBy: [] },
  { id: 'b', blockedBy: ['a'] },
  { id: 'c', blockedBy: ['a'] },
  { id: 'd', blockedBy: ['b', 'c'] },
  { id: 'e', blockedBy: ['d'] },
];

const depsOfA = getDirectDependents(tasks, 'a');
assert.deepStrictEqual(depsOfA.sort(), ['b', 'c']);

const depsOfD = getDirectDependents(tasks, 'd');
assert.deepStrictEqual(depsOfD, ['e']);

const depsOfE = getDirectDependents(tasks, 'e');
assert.deepStrictEqual(depsOfE, []);

// ── getTransitiveDependents ──

const transOfA = getTransitiveDependents(tasks, 'a');
assert.deepStrictEqual(transOfA.sort(), ['b', 'c', 'd', 'e']);

const transOfB = getTransitiveDependents(tasks, 'b');
assert.deepStrictEqual(transOfB.sort(), ['d', 'e']);

const transOfE = getTransitiveDependents(tasks, 'e');
assert.deepStrictEqual(transOfE, []);

// ── Diamond graph transitive dependents ──

const diamond = [
  { id: '1', blockedBy: [] },
  { id: '2', blockedBy: ['1'] },
  { id: '3', blockedBy: ['1'] },
  { id: '4', blockedBy: ['2', '3'] },
];
const transOf1 = getTransitiveDependents(diamond, '1');
assert.deepStrictEqual(transOf1.sort(), ['2', '3', '4']);
// 4 should appear only once even though reachable via both 2 and 3
assert.strictEqual(transOf1.filter(x => x === '4').length, 1);

// ── wouldCycle with new dep ──

// Adding e → a should create cycle (a→b→d→e→a)
assert.strictEqual(wouldCycle(tasks, 'e', 'a'), false); // e.blockedBy=[d], checking if d..→e reaches 'e' from 'a'
// Actually: wouldCycle(from, to) checks if adding 'to' to from.blockedBy would cycle
// It BFS from toId following blockedBy, checking if it reaches fromId
// Adding a→e: from=a, to=e. BFS from e, follow blockedBy: d→b,c→a. Reaches a! Cycle.
assert.strictEqual(wouldCycle(tasks, 'a', 'e'), true);

// Adding c→b should not cycle (no path from b→...→c)
assert.strictEqual(wouldCycle(tasks, 'c', 'b'), false);

console.log('Mutation tests passed');
