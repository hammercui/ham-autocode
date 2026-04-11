const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const git = require('../../../dist/utils/git').default;

const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ham-git-test-'));

execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
execFileSync('git', ['config', 'user.name', 'ham-autocode'], { cwd: repoDir, stdio: 'ignore' });
execFileSync('git', ['config', 'user.email', 'ham@example.com'], { cwd: repoDir, stdio: 'ignore' });
fs.writeFileSync(path.join(repoDir, 'README.md'), '# test repo\n', 'utf8');
execFileSync('git', ['add', 'README.md'], { cwd: repoDir, stdio: 'ignore' });
execFileSync('git', ['commit', '-m', 'init'], { cwd: repoDir, stdio: 'ignore' });

const result = git.status(repoDir);
assert.strictEqual(typeof result.ok, 'boolean');
assert.strictEqual(typeof result.output, 'string');

const logResult = git.log(3, repoDir);
assert.strictEqual(logResult.ok, true);
assert.ok(logResult.output.includes('init'));

fs.rmSync(repoDir, { recursive: true, force: true });
console.log('git tests passed');
