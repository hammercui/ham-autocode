const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dispatch, usage } = require('../../dist/index');

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-cli-test-'));

const config = dispatch(['config', 'show'], projectDir);
assert.strictEqual(config.schemaVersion, 2);
assert.ok(config.context);
assert.ok(config.validation);

const dagStatus = dispatch(['dag', 'status'], projectDir);
assert.strictEqual(typeof dagStatus.total, 'number');

const gates = dispatch(['validate', 'detect'], projectDir);
assert.ok(Array.isArray(gates));

const help = usage();
assert.ok(help.includes('ham-autocode'));
assert.ok(help.includes('config show'));

fs.rmSync(projectDir, { recursive: true, force: true });
console.log('CLI tests passed');
