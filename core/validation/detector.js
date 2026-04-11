// core/validation/detector.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJSON } = require('../state/atomic');

function isCommandAvailable(command) {
  const probe = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(probe, [command], { stdio: 'ignore' });
  return result.status === 0;
}

/**
 * Auto-detect lint/test/typecheck commands from project config files.
 * Scans: package.json, Makefile, pyproject.toml, Cargo.toml
 */
function detectGates(projectDir) {
  const gates = [];

  // package.json
  const { data: pkg, error: pkgError } = readJSON(path.join(projectDir, 'package.json'));
  if (pkgError && pkgError.code !== 'ENOENT') throw pkgError;
  if (pkg?.scripts) {
    if (pkg.scripts.lint) gates.push({ name: 'lint', cmd: 'npm run lint', source: 'package.json' });
    if (pkg.scripts.typecheck || pkg.scripts['type-check']) {
      const script = pkg.scripts.typecheck ? 'typecheck' : 'type-check';
      gates.push({ name: 'typecheck', cmd: `npm run ${script}`, source: 'package.json' });
    }
    if (pkg.scripts.test) gates.push({ name: 'test', cmd: 'npm test', source: 'package.json' });
  }

  // Makefile
  const makefile = path.join(projectDir, 'Makefile');
  if (fs.existsSync(makefile)) {
    try {
      const content = fs.readFileSync(makefile, 'utf8');
      if (/^lint:/m.test(content)) gates.push({ name: 'lint', cmd: 'make lint', source: 'Makefile' });
      if (/^typecheck:/m.test(content)) gates.push({ name: 'typecheck', cmd: 'make typecheck', source: 'Makefile' });
      if (/^test:/m.test(content)) gates.push({ name: 'test', cmd: 'make test', source: 'Makefile' });
    } catch { /* ignore */ }
  }

  // pyproject.toml
  const pyproject = path.join(projectDir, 'pyproject.toml');
  if (fs.existsSync(pyproject)) {
    if (isCommandAvailable('ruff')) gates.push({ name: 'lint', cmd: 'ruff check .', source: 'pyproject.toml' });
    if (isCommandAvailable('mypy')) gates.push({ name: 'typecheck', cmd: 'mypy .', source: 'pyproject.toml' });
    if (isCommandAvailable('pytest')) gates.push({ name: 'test', cmd: 'pytest', source: 'pyproject.toml' });
  }

  // Cargo.toml
  const cargo = path.join(projectDir, 'Cargo.toml');
  if (fs.existsSync(cargo) && isCommandAvailable('cargo')) {
    gates.push({ name: 'lint', cmd: 'cargo clippy', source: 'Cargo.toml' });
    gates.push({ name: 'typecheck', cmd: 'cargo check', source: 'Cargo.toml' });
    gates.push({ name: 'test', cmd: 'cargo test', source: 'Cargo.toml' });
  }

  // Deduplicate by name (first match wins)
  const seen = new Set();
  return gates.filter(g => {
    if (seen.has(g.name)) return false;
    seen.add(g.name);
    return true;
  });
}

module.exports = { detectGates };
