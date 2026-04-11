// core/__tests__/state/atomic.test.js
const { atomicWriteJSON, readJSON } = require('../../state/atomic');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-test-'));
const testFile = path.join(tmpDir, 'test.json');

// Test write and read
atomicWriteJSON(testFile, { hello: 'world' });
const data = readJSON(testFile);
assert.deepStrictEqual(data, { hello: 'world' });

// Test readJSON on non-existent file
assert.strictEqual(readJSON(path.join(tmpDir, 'nope.json')), null);

// Cleanup
fs.rmSync(tmpDir, { recursive: true });
console.log('atomic tests passed');
