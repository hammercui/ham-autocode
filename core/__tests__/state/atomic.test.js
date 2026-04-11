// core/__tests__/state/atomic.test.js
const { atomicWriteJSON, readJSON } = require('../../../dist/state/atomic');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-test-'));
const testFile = path.join(tmpDir, 'test.json');

// Test write and read
atomicWriteJSON(testFile, { hello: 'world' });
const { data, error } = readJSON(testFile);
assert.strictEqual(error, null);
assert.deepStrictEqual(data, { hello: 'world' });

// Test readJSON on non-existent file
const missing = readJSON(path.join(tmpDir, 'nope.json'));
assert.strictEqual(missing.data, null);
assert.ok(missing.error);

// Cleanup
fs.rmSync(tmpDir, { recursive: true });
console.log('atomic tests passed');
