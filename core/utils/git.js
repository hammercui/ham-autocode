'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function validateGitArg(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${label}`);
  }
  if (value.includes('\0')) {
    throw new Error(`Invalid ${label}: contains null byte`);
  }
  return value;
}

function validateGitPath(targetPath, cwd) {
  const normalized = path.resolve(cwd, validateGitArg(targetPath, 'path'));
  const root = path.resolve(cwd);
  if (normalized !== root && !normalized.startsWith(root + path.sep)) {
    throw new Error(`Invalid path: ${targetPath}`);
  }
  return targetPath;
}

function validateGitPaths(files, cwd) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Invalid files list');
  }
  return files.map(file => validateGitPath(file, cwd));
}

function run(args, cwd) {
  const tmpBase = path.join(os.tmpdir(), `ham-git-${process.pid}-${Date.now()}`);
  const stdoutPath = `${tmpBase}.out`;
  const stderrPath = `${tmpBase}.err`;
  const stdoutFd = fs.openSync(stdoutPath, 'w');
  const stderrFd = fs.openSync(stderrPath, 'w');

  try {
    execFileSync('git', args, {
      cwd,
      timeout: 30000,
      stdio: ['ignore', stdoutFd, stderrFd],
    });
    return { ok: true, output: fs.readFileSync(stdoutPath, 'utf8').trim() };
  } catch (e) {
    const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf8') : '';
    const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, 'utf8') : '';
    return { ok: false, output: (stderr || stdout || e.message || '').toString().trim() };
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
    if (fs.existsSync(stdoutPath)) fs.rmSync(stdoutPath, { force: true });
    if (fs.existsSync(stderrPath)) fs.rmSync(stderrPath, { force: true });
  }
}

const git = {
  tag(name, cwd) {
    return run(['tag', validateGitArg(name, 'tag name')], cwd);
  },
  deleteTag(name, cwd) {
    return run(['tag', '-d', validateGitArg(name, 'tag name')], cwd);
  },
  checkoutFiles(ref, files, cwd) {
    return run(['checkout', validateGitArg(ref, 'ref'), '--', ...validateGitPaths(files, cwd)], cwd);
  },
  checkoutAll(ref, cwd) {
    return run(['checkout', validateGitArg(ref, 'ref'), '--', '.'], cwd);
  },
  worktreeAdd(path_, branch, cwd) {
    validateGitPath(path_, cwd);
    return run(['worktree', 'add', path_, '-b', validateGitArg(branch, 'branch name')], cwd);
  },
  worktreeRemove(path_, cwd) {
    validateGitPath(path_, cwd);
    return run(['worktree', 'remove', path_, '--force'], cwd);
  },
  branchDelete(name, cwd) {
    return run(['branch', '-D', validateGitArg(name, 'branch name')], cwd);
  },
  merge(branch, cwd) {
    return run(['merge', validateGitArg(branch, 'branch name')], cwd);
  },
  status(cwd) {
    return run(['status', '--porcelain'], cwd);
  },
  log(n, cwd) {
    return run(['log', '--oneline', `-${Number(n) || 1}`], cwd);
  },
  diff(cwd) {
    return run(['diff', '--stat'], cwd);
  },
  listTags(pattern, cwd) {
    return run(['tag', '-l', validateGitArg(pattern, 'tag pattern')], cwd);
  },
};

module.exports = git;
