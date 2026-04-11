/**
 * Two-strike gate runner.
 * Runs detected validation commands, captures output, reports pass/fail.
 * On first failure: retry once. On second failure: report as failed.
 *
 * Security boundary:
 * Validation commands come from the user's own repository config (package.json,
 * Makefile, pyproject.toml, Cargo.toml). Running them is an explicit trust
 * decision of this harness and not treated as untrusted shell input.
 */

import { execSync } from 'child_process';
import { detectGates } from './detector.js';
import { loadConfig } from '../state/config.js';
import type {
  TaskState,
  DetectedGate,
  GateAction,
  ValidationResult,
  ValidationConfig,
} from '../types.js';

/** Rollback function signature — injected to avoid circular dependency */
export type RollbackFn = (ref: string, cwd: string, files?: string[]) => { ok: boolean; error: string | null };

interface GateRunResult {
  name: string;
  cmd: string;
  passed: boolean;
  output: string;
  attempts: number;
}

interface RunValidationResult {
  passed: boolean;
  results: GateRunResult[];
  summary: string;
}

function runGate(gate: DetectedGate, cwd: string): GateRunResult {
  try {
    const output = execSync(gate.command, { cwd, encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
    return { name: gate.name, cmd: gate.command, passed: true, output: output.trim(), attempts: 1 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      name: gate.name,
      cmd: gate.command,
      passed: false,
      output: (err.stdout || '') + (err.stderr || err.message || ''),
      attempts: 1,
    };
  }
}

/**
 * Run all validation gates for a project with two-strike policy.
 */
export function runValidation(projectDir: string, gateNames?: string[]): RunValidationResult {
  const detected: DetectedGate[] = detectGates(projectDir);

  // Filter to requested gates if specified
  const gates = gateNames
    ? detected.filter(g => gateNames.includes(g.name))
    : detected;

  if (gates.length === 0) {
    const requested = Array.isArray(gateNames) && gateNames.length > 0;
    return {
      passed: !requested,
      results: [],
      summary: requested ? `Requested gates not found: ${gateNames!.join(', ')}` : 'No validation gates detected',
    };
  }

  const results: GateRunResult[] = [];
  let allPassed = true;

  for (const gate of gates) {
    const result = runGate(gate, projectDir);
    results.push(result);
    if (!result.passed) allPassed = false;
  }

  const passCount = results.filter(r => r.passed).length;
  const summary = `${passCount}/${results.length} gates passed`;

  return { passed: allPassed, results, summary };
}

/**
 * Extended ValidationResult with auto-rollback indicator (Gap B4).
 */
export interface ValidateTaskResult extends ValidationResult {
  rolledBack: boolean;
}

/**
 * Validate a task's changes -- runs configured gates.
 * Returns validation result to be stored in task.validation.
 *
 * Gap B4: When action='block' and task has a checkpointRef, automatically
 * rolls back using the provided rollbackFn (avoids circular dependency).
 */
export function validateTask(
  task: TaskState,
  projectDir: string,
  rollbackFn?: RollbackFn,
): ValidateTaskResult {
  const config: ValidationConfig = loadConfig(projectDir).validation;
  const gateNames = config.gates || ['lint', 'typecheck', 'test'];
  const result = runValidation(projectDir, gateNames);
  const attempts = (task.validation?.attempts || 0) + 1;
  const finalFailure = !result.passed && attempts >= config.maxAttempts;
  const onFail = config.onFinalFail === 'warn' ? 'block' as const : (config.onFinalFail || 'block' as const);
  const action: GateAction = result.passed ? 'proceed' : (finalFailure ? onFail : 'retry');

  let rolledBack = false;

  // Gap B4: auto-rollback on block if checkpoint exists
  if (action === 'block' && task.recovery?.checkpointRef && rollbackFn) {
    const rollbackResult = rollbackFn(task.recovery.checkpointRef, projectDir, task.files);
    rolledBack = rollbackResult.ok;
  }

  return {
    taskId: task.id,
    gates: result.results.map(r => ({
      gate: r.name,
      pass: r.passed,
      output: r.output,
      command: r.cmd,
    })),
    attempts,
    maxAttempts: config.maxAttempts,
    results: result.results.map(r => ({
      gate: r.name,
      pass: r.passed,
      output: r.output,
      command: r.cmd,
    })),
    passed: result.passed,
    action,
    rolledBack,
  };
}

export { detectGates };
