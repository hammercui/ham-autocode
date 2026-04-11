/**
 * Auto-detect lint/test/typecheck commands from project config files.
 * Scans: package.json, Makefile, pyproject.toml, Cargo.toml
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { readJSON } from '../state/atomic.js';
import type { DetectedGate } from '../types.js';

interface PackageJson {
  scripts?: Record<string, string>;
}

function isCommandAvailable(command: string): boolean {
  const probe = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(probe, [command], { stdio: 'ignore' });
  return result.status === 0;
}

export function detectGates(projectDir: string): DetectedGate[] {
  const gates: DetectedGate[] = [];

  // package.json
  const { data: pkg, error: pkgError } = readJSON(path.join(projectDir, 'package.json')) as { data: PackageJson | null; error: NodeJS.ErrnoException | null };
  if (pkgError && pkgError.code !== 'ENOENT') throw pkgError;
  if (pkg?.scripts) {
    if (pkg.scripts.lint) gates.push({ name: 'lint', command: 'npm run lint', source: 'package.json' });
    if (pkg.scripts.typecheck || pkg.scripts['type-check']) {
      const script = pkg.scripts.typecheck ? 'typecheck' : 'type-check';
      gates.push({ name: 'typecheck', command: `npm run ${script}`, source: 'package.json' });
    }
    if (pkg.scripts.test) gates.push({ name: 'test', command: 'npm test', source: 'package.json' });
  }

  // Makefile
  const makefile = path.join(projectDir, 'Makefile');
  if (fs.existsSync(makefile)) {
    try {
      const content = fs.readFileSync(makefile, 'utf8');
      if (/^lint:/m.test(content)) gates.push({ name: 'lint', command: 'make lint', source: 'Makefile' });
      if (/^typecheck:/m.test(content)) gates.push({ name: 'typecheck', command: 'make typecheck', source: 'Makefile' });
      if (/^test:/m.test(content)) gates.push({ name: 'test', command: 'make test', source: 'Makefile' });
    } catch { /* ignore */ }
  }

  // pyproject.toml
  const pyproject = path.join(projectDir, 'pyproject.toml');
  if (fs.existsSync(pyproject)) {
    if (isCommandAvailable('ruff')) gates.push({ name: 'lint', command: 'ruff check .', source: 'pyproject.toml' });
    if (isCommandAvailable('mypy')) gates.push({ name: 'typecheck', command: 'mypy .', source: 'pyproject.toml' });
    if (isCommandAvailable('pytest')) gates.push({ name: 'test', command: 'pytest', source: 'pyproject.toml' });
  }

  // Cargo.toml
  const cargo = path.join(projectDir, 'Cargo.toml');
  if (fs.existsSync(cargo) && isCommandAvailable('cargo')) {
    gates.push({ name: 'lint', command: 'cargo clippy', source: 'Cargo.toml' });
    gates.push({ name: 'typecheck', command: 'cargo check', source: 'Cargo.toml' });
    gates.push({ name: 'test', command: 'cargo test', source: 'Cargo.toml' });
  }

  // Deduplicate by name (first match wins)
  const seen = new Set<string>();
  return gates.filter(g => {
    if (seen.has(g.name)) return false;
    seen.add(g.name);
    return true;
  });
}
