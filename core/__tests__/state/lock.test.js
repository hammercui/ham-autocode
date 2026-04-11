// core/__tests__/state/lock.test.js
const { acquireLock, releaseLock, withLock } = require('../../state/lock');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));

// Test acquire and release
assert.strictEqual(acquireLock(tmpDir), true);
assert.strictEqual(fs.existsSync(path.join(tmpDir, '.lock')), true);
releaseLock(tmpDir);
assert.strictEqual(fs.existsSync(path.join(tmpDir, '.lock')), false);

// Test withLock
const result = withLock(tmpDir, () => 42);
assert.strictEqual(result, 42);
assert.strictEqual(fs.existsSync(path.join(tmpDir, '.lock')), false);

// Cleanup
fs.rmSync(tmpDir, { recursive: true });
console.log('lock tests passed');
