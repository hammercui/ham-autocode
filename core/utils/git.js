'use strict';
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
  try {
    return {
      ok: true,
      output: execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 30000 }).trim(),
    };
  } catch (e) {
    return { ok: false, output: (e.stderr || e.stdout || e.message || '').toString().trim() };
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
