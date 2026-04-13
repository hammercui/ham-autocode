// core/utils/git.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import type { GitResult } from '../types.js';

function validateGitArg(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${label}`);
  }
  if (value.includes('\0')) {
    throw new Error(`Invalid ${label}: contains null byte`);
  }
  return value;
}

function validateGitPath(targetPath: string, cwd: string): string {
  const normalized = path.resolve(cwd, validateGitArg(targetPath, 'path'));
  const root = path.resolve(cwd);
  if (normalized !== root && !normalized.startsWith(root + path.sep)) {
    throw new Error(`Invalid path: ${targetPath}`);
  }
  return targetPath;
}

function validateGitPaths(files: string[], cwd: string): string[] {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Invalid files list');
  }
  return files.map(file => validateGitPath(file, cwd));
}

function run(args: string[], cwd: string): GitResult {
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
    return { ok: false, output: (stderr || stdout || (e as Error).message || '').toString().trim() };
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
    if (fs.existsSync(stdoutPath)) fs.rmSync(stdoutPath, { force: true });
    if (fs.existsSync(stderrPath)) fs.rmSync(stderrPath, { force: true });
  }
}

const git = {
  tag(name: string, cwd: string): GitResult {
    return run(['tag', validateGitArg(name, 'tag name')], cwd);
  },
  deleteTag(name: string, cwd: string): GitResult {
    return run(['tag', '-d', validateGitArg(name, 'tag name')], cwd);
  },
  checkoutFiles(ref: string, files: string[], cwd: string): GitResult {
    return run(['checkout', validateGitArg(ref, 'ref'), '--', ...validateGitPaths(files, cwd)], cwd);
  },
  checkoutAll(ref: string, cwd: string): GitResult {
    return run(['checkout', validateGitArg(ref, 'ref'), '--', '.'], cwd);
  },
  worktreeAdd(path_: string, branch: string, cwd: string): GitResult {
    validateGitPath(path_, cwd);
    return run(['worktree', 'add', path_, '-b', validateGitArg(branch, 'branch name')], cwd);
  },
  worktreeRemove(path_: string, cwd: string): GitResult {
    validateGitPath(path_, cwd);
    return run(['worktree', 'remove', path_, '--force'], cwd);
  },
  branchDelete(name: string, cwd: string): GitResult {
    return run(['branch', '-D', validateGitArg(name, 'branch name')], cwd);
  },
  merge(branch: string, cwd: string): GitResult {
    return run(['merge', validateGitArg(branch, 'branch name')], cwd);
  },
  status(cwd: string): GitResult {
    return run(['status', '--porcelain'], cwd);
  },
  log(n: number, cwd: string): GitResult {
    return run(['log', '--oneline', `-${Number(n) || 1}`], cwd);
  },
  diff(cwd: string): GitResult {
    return run(['diff', '--stat'], cwd);
  },
  add(file: string, cwd: string): GitResult {
    validateGitPath(file, cwd);
    return run(['add', file], cwd);
  },
  commit(message: string, cwd: string): GitResult {
    if (!message || message.length === 0) return { ok: false, output: 'Empty commit message' };
    return run(['commit', '-m', message], cwd);
  },
  resetLast(cwd: string): GitResult {
    return run(['reset', 'HEAD~1', '--mixed'], cwd);
  },
  listTags(pattern: string, cwd: string): GitResult {
    return run(['tag', '-l', validateGitArg(pattern, 'tag pattern')], cwd);
  },
};

export default git;
