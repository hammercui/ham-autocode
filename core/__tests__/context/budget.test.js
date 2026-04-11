// core/__tests__/context/budget.test.js
const { ContextBudget } = require('../../context/budget');
const { ContextManager } = require('../../context/manager');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a temp project dir for testing
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-test-'));

// Test ContextBudget
const budget = new ContextBudget(tmpDir);
assert.strictEqual(budget.consumed, 0);
assert.strictEqual(budget.level(), 'ok');

// Consume tokens and check thresholds
budget.consume(50000); // 25%
assert.strictEqual(budget.level(), 'ok');

budget.consume(15000); // 65000 = 32.5%
assert.strictEqual(budget.level(), 'advisory');

budget.consume(40000); // 105000 = 52.5%
assert.strictEqual(budget.level(), 'compress');

budget.consume(40000); // 145000 = 72.5%
assert.strictEqual(budget.level(), 'critical');

// Test status
const s = budget.status();
assert.strictEqual(s.consumed, 145000);
assert.strictEqual(s.level, 'critical');
assert.ok(s.thresholds.advisoryThreshold);

// Test reset
budget.reset();
assert.strictEqual(budget.consumed, 0);
assert.strictEqual(budget.level(), 'ok');

// Persistence across instances
budget.consume(1234);
const reloadedBudget = new ContextBudget(tmpDir);
assert.strictEqual(reloadedBudget.consumed, 1234);

// Test ContextManager
const srcDir = path.join(tmpDir, 'src');
fs.mkdirSync(srcDir, { recursive: true });
fs.writeFileSync(path.join(tmpDir, 'test.js'), 'console.log("hello");');
fs.writeFileSync(path.join(srcDir, 'app.js'), 'module.exports = {}');

const mgr = new ContextManager(tmpDir);
const idx = mgr.indexProject();
assert.ok(Object.keys(idx).length > 0, 'Should index files');

// Test estimateTask
const task = { files: ['test.js'], spec: { description: 'test task' } };
const est = mgr.estimateTask(task);
assert.ok(est > 0, 'Should estimate > 0 tokens');

// Test prepareForTask
const ctx = mgr.prepareForTask(task);
assert.strictEqual(ctx.files.length, 1);
assert.ok(ctx.files[0].content.includes('hello'));
assert.ok(ctx.budgetStatus);
assert.ok(ctx.recommendation);

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('context tests passed');
