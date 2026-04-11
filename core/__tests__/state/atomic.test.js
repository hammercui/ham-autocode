// core/__tests__/state/atomic.test.js
const { atomicWriteJSON, readJSON } = require('../../state/atomic');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a temp dir for testing
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-test-'));
const testFile = path.join(tmpDir, 'test.json');

// Test write and read
const data = { foo: 'bar', num: 42 };
atomicWriteJSON(testFile, data);
const read = readJSON(testFile);
assert.deepStrictEqual(read, data, 'Should read back what was written');

// Test readJSON on non-existent file
const noFile = readJSON(path.join(tmpDir, 'nope.json'));
assert.strictEqual(noFile, null, 'Should return null for missing file');

// Test nested dir creation
const nestedFile = path.join(tmpDir, 'a', 'b', 'c.json');
atomicWriteJSON(nestedFile, { nested: true });
assert.deepStrictEqual(readJSON(nestedFile), { nested: true });

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('atomic tests passed');
