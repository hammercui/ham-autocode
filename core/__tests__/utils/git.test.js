// core/__tests__/utils/git.test.js
const git = require('../../utils/git');
const assert = require('assert');

// Test status in current repo
const result = git.status(process.cwd());
assert.strictEqual(typeof result.ok, 'boolean');
assert.strictEqual(typeof result.output, 'string');

// Test log
const logResult = git.log(3, process.cwd());
assert.strictEqual(logResult.ok, true);

console.log('git tests passed');
