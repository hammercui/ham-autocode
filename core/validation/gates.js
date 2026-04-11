// core/validation/gates.js
'use strict';
const { execSync } = require('child_process');
const { detectGates } = require('./detector');
const { loadConfig } = require('../state/config');

/**
 * Two-strike gate runner.
 * Runs detected validation commands, captures output, reports pass/fail.
 * On first failure: retry once. On second failure: report as failed.
 */
function runGate(gate, cwd) {
  try {
    const output = execSync(gate.cmd, { cwd, encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
    return { name: gate.name, cmd: gate.cmd, passed: true, output: output.trim(), attempts: 1 };
  } catch (e) {
    return {
      name: gate.name,
      cmd: gate.cmd,
      passed: false,
      output: (e.stdout || '') + (e.stderr || e.message),
      attempts: 1,
    };
  }
}

/**
 * Run all validation gates for a project with two-strike policy.
 * @param {string} projectDir - Project root directory
 * @param {string[]} [gateNames] - Specific gates to run (null = all detected)
 * @returns {{ passed: boolean, results: Array, summary: string }}
 */
function runValidation(projectDir, gateNames) {
  const config = loadConfig(projectDir).validation;
  const maxAttempts = config.maxAttempts || 2;
  const detected = detectGates(projectDir);

  // Filter to requested gates if specified
  const gates = gateNames
    ? detected.filter(g => gateNames.includes(g.name))
    : detected;

  if (gates.length === 0) {
    return { passed: true, results: [], summary: 'No validation gates detected' };
  }

  const results = [];
  let allPassed = true;

  for (const gate of gates) {
    let result = runGate(gate, projectDir);

    // Two-strike: retry on first failure
    if (!result.passed && maxAttempts > 1) {
      result = runGate(gate, projectDir);
      result.attempts = 2;
    }

    results.push(result);
    if (!result.passed) allPassed = false;
  }

  const passCount = results.filter(r => r.passed).length;
  const summary = `${passCount}/${results.length} gates passed`;

  return { passed: allPassed, results, summary };
}

/**
 * Validate a task's changes — runs configured gates.
 * Returns validation result to be stored in task.validation.
 */
function validateTask(task, projectDir) {
  const config = loadConfig(projectDir).validation;
  const gateNames = config.gates || ['lint', 'typecheck', 'test'];
  const result = runValidation(projectDir, gateNames);

  return {
    gates: result.results.map(r => ({ name: r.name, passed: r.passed, attempts: r.attempts })),
    attempts: (task.validation?.attempts || 0) + 1,
    maxAttempts: config.maxAttempts,
    results: result.results,
    passed: result.passed,
    action: result.passed ? 'proceed' : (config.onFinalFail || 'block'),
  };
}

module.exports = { detectGates, runValidation, validateTask };
