// core/__tests__/state/lock.test.js
const { acquireLock, releaseLock, withLock } = require('../../state/lock');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a temp dir for testing
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));

// Test acquire and release
assert.strictEqual(acquireLock(tmpDir), true, 'Should acquire lock');
assert.strictEqual(fs.existsSync(path.join(tmpDir, '.lock')), true, 'Lock dir should exist');
releaseLock(tmpDir);
assert.strictEqual(fs.existsSync(path.join(tmpDir, '.lock')), false, 'Lock dir should be removed');

// Test withLock
const result = withLock(tmpDir, () => 42);
assert.strictEqual(result, 42, 'withLock should return fn result');
assert.strictEqual(fs.existsSync(path.join(tmpDir, '.lock')), false, 'Lock should be released after withLock');

// Test withLock error handling
try {
  withLock(tmpDir, () => { throw new Error('test error'); });
} catch (e) {
  assert.strictEqual(e.message, 'test error');
  assert.strictEqual(fs.existsSync(path.join(tmpDir, '.lock')), false, 'Lock should be released on error');
}

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('lock tests passed');
