#!/usr/bin/env node
// Run all test suites sequentially
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const testDir = __dirname;

const suites = [
  'utils/token.test.js',
  'utils/git.test.js',
  'state/lock.test.js',
  'state/atomic.test.js',
  'dag/graph.test.js',
  'dag/mutations.test.js',
  'routing/scorer.test.js',
  'cli.test.js',
  'spec-lint-test.js',
];

let passed = 0;
let failed = 0;

for (const suite of suites) {
  const suitePath = path.join(testDir, suite);
  try {
    execFileSync(process.execPath, [suitePath], { stdio: 'inherit', timeout: 30000 });
    passed++;
  } catch {
    console.error(`FAIL: ${suite}`);
    failed++;
  }
}

console.log(`\n${passed + failed} suites, ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
