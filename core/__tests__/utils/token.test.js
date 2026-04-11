// core/__tests__/utils/token.test.js
const { estimateTokens } = require('../../../dist/utils/token');
const assert = require('assert');

assert.strictEqual(estimateTokens(''), 0);
assert.strictEqual(estimateTokens('abcd'), 1);
assert.strictEqual(estimateTokens('a'.repeat(100)), 25);
assert.strictEqual(estimateTokens(null), 0);
console.log('token tests passed');
