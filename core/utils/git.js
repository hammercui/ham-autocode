// core/utils/git.js
'use strict';
const { execSync } = require('child_process');

function run(cmd, cwd) {
  try {
    return { ok: true, output: execSync(cmd, { cwd, encoding: 'utf8', timeout: 30000 }).trim() };
  } catch (e) {
    return { ok: false, output: e.stderr || e.message };
  }
}

const git = {
  tag(name, cwd) { return run(`git tag "${name}"`, cwd); },
  deleteTag(name, cwd) { return run(`git tag -d "${name}"`, cwd); },
  checkoutFiles(ref, files, cwd) {
    return run(`git checkout "${ref}" -- ${files.map(f => `"${f}"`).join(' ')}`, cwd);
  },
  worktreeAdd(path_, branch, cwd) {
    return run(`git worktree add "${path_}" -b "${branch}"`, cwd);
  },
  worktreeRemove(path_, cwd) {
    return run(`git worktree remove "${path_}" --force`, cwd);
  },
  branchDelete(name, cwd) { return run(`git branch -D "${name}"`, cwd); },
  merge(branch, cwd) { return run(`git merge "${branch}"`, cwd); },
  status(cwd) { return run('git status --porcelain', cwd); },
  log(n, cwd) { return run(`git log --oneline -${n}`, cwd); },
  diff(cwd) { return run('git diff --stat', cwd); },
};

module.exports = git;
