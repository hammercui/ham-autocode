/**
 * Project Health Checker.
 * Automated health assessment: git status, TypeScript compilation,
 * test execution, dependency audit, and composite scoring.
 *
 * Supports multi-tsconfig projects (e.g., Electron with ESM + CJS).
 * Zero runtime dependencies.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────

export interface HealthCheckResult {
  score: number;               // 0-100 composite score
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checkedAt: string;
  checks: HealthCheck[];
  summary: string;
}

export interface HealthCheck {
  name: string;
  category: 'git' | 'compile' | 'test' | 'deps' | 'lint';
  pass: boolean;
  score: number;               // 0-100 per check
  weight: number;              // weight in composite score
  detail: string;
  errors?: string[];
}

interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * On Windows, npm/npx must be invoked as npm.cmd/npx.cmd.
 */
function platformCmd(cmd: string): string {
  if (process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx')) {
    return cmd + '.cmd';
  }
  return cmd;
}

function safeExec(cmd: string, args: string[], cwd: string, timeoutMs = 60000): ExecResult {
  try {
    const useShell = process.platform === 'win32';
    const stdout = execFileSync(platformCmd(cmd), args, {
      cwd,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: useShell,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
    });
    return { ok: true, stdout: stdout || '', stderr: '' };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || 'Unknown error',
    };
  }
}

function gradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ─── Individual Checks ─────────────────────────────────────────

/**
 * Check 1: Git status — uncommitted changes, untracked files.
 */
function checkGitStatus(projectDir: string): HealthCheck {
  const result = safeExec('git', ['status', '--porcelain'], projectDir);
  if (!result.ok) {
    return {
      name: 'Git Status',
      category: 'git',
      pass: false,
      score: 0,
      weight: 15,
      detail: 'Not a git repository or git not available',
      errors: [result.stderr],
    };
  }

  const lines = result.stdout.trim().split('\n').filter(l => l.length > 0);
  const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
  const untracked = lines.filter(l => l.startsWith('??')).length;
  const staged = lines.filter(l => /^[AMDRC]/.test(l)).length;
  const total = lines.length;

  let score = 100;
  if (total > 0) score -= Math.min(50, total * 5);
  if (untracked > 5) score -= 10;
  score = Math.max(0, score);

  return {
    name: 'Git Status',
    category: 'git',
    pass: total === 0,
    score,
    weight: 15,
    detail: total === 0
      ? 'Working tree clean'
      : `${modified} modified, ${untracked} untracked, ${staged} staged`,
    errors: total > 0 ? [`${total} uncommitted changes`] : undefined,
  };
}

/**
 * Check 2: TypeScript compilation — supports multiple tsconfig files (F3).
 */
function checkTypeScript(projectDir: string): HealthCheck {
  // Find all tsconfig*.json files — check root and one level of subdirs (monorepo)
  let tsconfigs: { config: string; cwd: string }[] = [];
  const rootEntries = fs.readdirSync(projectDir);
  for (const f of rootEntries) {
    if (f.startsWith('tsconfig') && f.endsWith('.json')) {
      tsconfigs.push({ config: f, cwd: projectDir });
    }
  }
  // Monorepo: scan subdirs if root has no tsconfig
  if (tsconfigs.length === 0) {
    for (const entry of rootEntries) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      const subDir = path.join(projectDir, entry);
      try {
        if (!fs.statSync(subDir).isDirectory()) continue;
        for (const f of fs.readdirSync(subDir)) {
          if (f.startsWith('tsconfig') && f.endsWith('.json')) {
            tsconfigs.push({ config: f, cwd: subDir });
          }
        }
      } catch { /* skip */ }
    }
  }

  if (tsconfigs.length === 0) {
    return {
      name: 'TypeScript',
      category: 'compile',
      pass: true,
      score: 100,
      weight: 25,
      detail: 'No tsconfig found (not a TypeScript project)',
    };
  }

  const results: { config: string; ok: boolean; errorCount: number; errors: string[] }[] = [];

  for (const { config: tsconfig, cwd } of tsconfigs) {
    const label = cwd === projectDir ? tsconfig : path.relative(projectDir, path.join(cwd, tsconfig));
    const res = safeExec('npx', ['tsc', '--noEmit', '-p', tsconfig], cwd, 120000);
    const allOutput = res.stdout + '\n' + res.stderr;
    const errorLines = allOutput
      .split('\n')
      .filter(l => /error TS\d+/.test(l));
    const passed = res.ok || errorLines.length === 0;
    results.push({
      config: label,
      ok: passed,
      errorCount: errorLines.length,
      errors: errorLines.slice(0, 10),
    });
  }

  const allPass = results.every(r => r.ok);
  const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);
  let score = 100;
  if (totalErrors > 0) score = Math.max(0, 100 - totalErrors * 10);

  const detail = results
    .map(r => `${r.config} ${r.ok ? 'PASS' : `FAIL (${r.errorCount} errors)`}`)
    .join(', ');

  const allErrors = results.flatMap(r => r.errors);

  return {
    name: 'TypeScript',
    category: 'compile',
    pass: allPass,
    score,
    weight: 25,
    detail,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}

/**
 * Check 3: Test execution — auto-detect test runner.
 */
/**
 * Find package.json — check root, then one level of subdirs (monorepo).
 */
function findPackageDir(projectDir: string): string | null {
  if (fs.existsSync(path.join(projectDir, 'package.json'))) return projectDir;
  try {
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const sub = path.join(projectDir, entry.name);
      if (fs.existsSync(path.join(sub, 'package.json'))) return sub;
    }
  } catch { /* skip */ }
  return null;
}

function checkTests(projectDir: string): HealthCheck {
  const pkgDir = findPackageDir(projectDir);
  const pkgPath = pkgDir ? path.join(pkgDir, 'package.json') : null;
  if (!pkgPath) {
    return {
      name: 'Tests',
      category: 'test',
      pass: true,
      score: 100,
      weight: 25,
      detail: 'No package.json found',
    };
  }

  let pkg: { scripts?: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return {
      name: 'Tests',
      category: 'test',
      pass: false,
      score: 0,
      weight: 25,
      detail: 'Cannot parse package.json',
    };
  }

  // Check if test script exists
  if (!pkg.scripts?.test || pkg.scripts.test.includes('no test specified')) {
    return {
      name: 'Tests',
      category: 'test',
      pass: true,
      score: 70,
      weight: 25,
      detail: 'No test script configured',
    };
  }

  const res = safeExec('npm', ['test'], pkgDir!, 120000);
  const output = res.stdout + '\n' + res.stderr;

  // "No test files found" is not a failure — it's just no tests written yet
  if (/no test (files|suites?) found/i.test(output)) {
    return {
      name: 'Tests',
      category: 'test',
      pass: true,
      score: 70,
      weight: 25,
      detail: 'No test files found (consider adding tests)',
    };
  }

  // Try to extract pass/fail counts
  const passMatch = output.match(/(\d+)\s+pass/i);
  const failMatch = output.match(/(\d+)\s+fail/i);
  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const total = passed + failed;

  let score = res.ok ? 100 : 0;
  if (total > 0) {
    score = Math.round((passed / total) * 100);
  }

  return {
    name: 'Tests',
    category: 'test',
    pass: res.ok,
    score,
    weight: 25,
    detail: total > 0
      ? `${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ''}`
      : (res.ok ? 'Tests passed' : 'Tests failed'),
    errors: !res.ok ? [output.slice(-500)] : undefined,
  };
}

/**
 * Check 4: Dependency audit.
 */
function checkDeps(projectDir: string): HealthCheck {
  const pkgDir = findPackageDir(projectDir);
  if (!pkgDir) {
    return {
      name: 'Dependencies',
      category: 'deps',
      pass: true,
      score: 100,
      weight: 15,
      detail: 'No package.json found',
    };
  }

  // Check node_modules exists
  const nmPath = path.join(pkgDir, 'node_modules');
  if (!fs.existsSync(nmPath)) {
    return {
      name: 'Dependencies',
      category: 'deps',
      pass: false,
      score: 30,
      weight: 15,
      detail: 'node_modules not found — run npm install',
      errors: ['Dependencies not installed'],
    };
  }

  // Run npm audit
  const res = safeExec('npm', ['audit', '--json'], pkgDir, 30000);
  let vulns = 0;
  let critical = 0;
  let high = 0;
  try {
    const audit = JSON.parse(res.stdout);
    const metadata = audit.metadata?.vulnerabilities || audit.vulnerabilities;
    if (metadata) {
      critical = metadata.critical || 0;
      high = metadata.high || 0;
      vulns = (metadata.total || 0);
    }
  } catch {
    // npm audit might output non-JSON on older versions
  }

  let score = 100;
  if (critical > 0) score -= critical * 20;
  if (high > 0) score -= high * 10;
  if (vulns > 0) score -= Math.min(20, (vulns - critical - high) * 2);
  score = Math.max(0, score);

  return {
    name: 'Dependencies',
    category: 'deps',
    pass: critical === 0 && high === 0,
    score,
    weight: 15,
    detail: vulns === 0
      ? 'No known vulnerabilities'
      : `${vulns} vulnerabilities (${critical} critical, ${high} high)`,
    errors: critical + high > 0
      ? [`${critical} critical, ${high} high severity vulnerabilities`]
      : undefined,
  };
}

/**
 * Check 5: Lint (auto-detect eslint/biome).
 */
function checkLint(projectDir: string): HealthCheck {
  // Detect linter
  const hasEslint = fs.existsSync(path.join(projectDir, '.eslintrc.json'))
    || fs.existsSync(path.join(projectDir, '.eslintrc.js'))
    || fs.existsSync(path.join(projectDir, '.eslintrc.cjs'))
    || fs.existsSync(path.join(projectDir, 'eslint.config.js'))
    || fs.existsSync(path.join(projectDir, 'eslint.config.mjs'));
  const hasBiome = fs.existsSync(path.join(projectDir, 'biome.json'));

  if (!hasEslint && !hasBiome) {
    return {
      name: 'Lint',
      category: 'lint',
      pass: true,
      score: 80,
      weight: 20,
      detail: 'No linter configured',
    };
  }

  let res: ExecResult;
  let linterName: string;

  if (hasBiome) {
    res = safeExec('npx', ['biome', 'check', '.'], projectDir);
    linterName = 'Biome';
  } else {
    res = safeExec('npx', ['eslint', '.', '--ext', '.ts,.tsx,.js,.jsx', '--max-warnings', '0'], projectDir);
    linterName = 'ESLint';
  }

  const errorLines = (res.stdout + '\n' + res.stderr)
    .split('\n')
    .filter(l => /error|warning/i.test(l) && !l.includes('0 errors'));
  const errorCount = errorLines.length;

  let score = res.ok ? 100 : Math.max(0, 100 - errorCount * 3);

  return {
    name: `Lint (${linterName})`,
    category: 'lint',
    pass: res.ok,
    score,
    weight: 20,
    detail: res.ok ? `${linterName}: clean` : `${linterName}: ${errorCount} issues`,
    errors: !res.ok ? errorLines.slice(0, 10) : undefined,
  };
}

// ─── Main Entry ─────────────────────────────────────────────────

/**
 * Run full health check on a project.
 * Returns composite score 0-100 with per-check breakdown.
 */
export function runHealthCheck(projectDir: string): HealthCheckResult {
  const checks: HealthCheck[] = [
    checkGitStatus(projectDir),
    checkTypeScript(projectDir),
    checkTests(projectDir),
    checkDeps(projectDir),
    checkLint(projectDir),
  ];

  // Weighted composite score
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round(
    checks.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight
  );

  const grade = gradeFromScore(score);
  const failedChecks = checks.filter(c => !c.pass);

  const summaryLines = [
    `Health Score: ${score}/100 (Grade ${grade})`,
    '',
    ...checks.map(c => `  ${c.pass ? 'PASS' : 'FAIL'} ${c.name}: ${c.detail} [${c.score}/100, weight ${c.weight}%]`),
  ];

  if (failedChecks.length > 0) {
    summaryLines.push('', 'Issues:');
    for (const c of failedChecks) {
      if (c.errors) {
        for (const err of c.errors.slice(0, 3)) {
          summaryLines.push(`  - [${c.name}] ${err}`);
        }
      }
    }
  }

  return {
    score,
    grade,
    checkedAt: new Date().toISOString(),
    checks,
    summary: summaryLines.join('\n'),
  };
}

/**
 * Quick health check — only git + compile (fast, <10s).
 */
export function quickHealthCheck(projectDir: string): HealthCheckResult {
  const checks: HealthCheck[] = [
    checkGitStatus(projectDir),
    checkTypeScript(projectDir),
  ];

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round(
    checks.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight
  );

  const grade = gradeFromScore(score);

  return {
    score,
    grade,
    checkedAt: new Date().toISOString(),
    checks,
    summary: checks.map(c => `${c.pass ? 'PASS' : 'FAIL'} ${c.name}: ${c.detail}`).join('\n'),
  };
}
