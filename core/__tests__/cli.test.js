// core/__tests__/cli.test.js
const { execSync } = require('child_process');
const assert = require('assert');
const path = require('path');

const CLI = path.join(__dirname, '..', 'index.js');
const CWD = path.join(__dirname, '..', '..');

function run(args) {
  return execSync(`node "${CLI}" ${args}`, { cwd: CWD, encoding: 'utf8', timeout: 10000 }).trim();
}

// Test: no args shows usage
const help = run('');
assert.ok(help.includes('ham-autocode core engine'), 'Should show usage');

// Test: config show
const config = JSON.parse(run('config show'));
assert.strictEqual(config.schemaVersion, 2);
assert.ok(config.context);
assert.ok(config.validation);
assert.ok(config.routing);
assert.ok(config.recovery);

// Test: dag status (empty — no tasks)
const dagStats = JSON.parse(run('dag status'));
assert.strictEqual(dagStats.total, 0);

// Test: context budget
const budget = JSON.parse(run('context budget'));
assert.ok(budget.level === 'ok');

// Test: validate detect
const gates = JSON.parse(run('validate detect'));
assert.ok(Array.isArray(gates));

// Test: checkpoint list
const checkpoints = JSON.parse(run('checkpoint list'));
assert.ok(Array.isArray(checkpoints));

// Test: token estimate on a known file
const tokenResult = JSON.parse(run(`token estimate "${path.join(CWD, 'core', 'index.js')}"`));
assert.ok(tokenResult.tokens > 0, 'Should estimate tokens for index.js');

console.log('CLI tests passed');
