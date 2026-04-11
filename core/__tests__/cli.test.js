// core/__tests__/cli.test.js
const { execSync } = require('child_process');
const assert = require('assert');
const path = require('path');

const cwd = path.resolve(__dirname, '../..');

function run(args) {
  return execSync(`node core/index.js ${args}`, { cwd, encoding: 'utf8', timeout: 10000 }).trim();
}

// Test config show
const config = JSON.parse(run('config show'));
assert.strictEqual(config.schemaVersion, 2);
assert.ok(config.context);
assert.ok(config.validation);

// Test dag status
const dagStatus = JSON.parse(run('dag status'));
assert.strictEqual(typeof dagStatus.total, 'number');

// Test context budget
const budget = JSON.parse(run('context budget'));
assert.strictEqual(budget.level, 'ok');
assert.strictEqual(typeof budget.consumed, 'number');

// Test validate detect
const gates = JSON.parse(run('validate detect'));
assert.ok(Array.isArray(gates));

// Test help
const help = run('help');
assert.ok(help.includes('ham-autocode'));
assert.ok(help.includes('config show'));

console.log('CLI tests passed');
