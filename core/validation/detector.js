// core/validation/detector.js
'use strict';
const fs = require('fs');
const path = require('path');
const { readJSON } = require('../state/atomic');

/**
 * Auto-detect lint/test/typecheck commands from project config files.
 * Scans: package.json, Makefile, pyproject.toml, Cargo.toml
 */
function detectGates(projectDir) {
  const gates = [];

  // package.json
  const pkg = readJSON(path.join(projectDir, 'package.json'));
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
    gates.push({ name: 'lint', cmd: 'ruff check .', source: 'pyproject.toml' });
    gates.push({ name: 'typecheck', cmd: 'mypy .', source: 'pyproject.toml' });
    gates.push({ name: 'test', cmd: 'pytest', source: 'pyproject.toml' });
  }

  // Cargo.toml
  const cargo = path.join(projectDir, 'Cargo.toml');
  if (fs.existsSync(cargo)) {
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
