/**
 * v4.1 Hashline — 防止 agent "行号漂移 / 误改邻居文件" 的编辑保护。
 *
 * 核心思想（对标 oh-my-openagent）:
 *   任务执行前捕获 git working tree 快照 → 执行后再捕获 → diff = 本次变更集。
 *   若变更集包含 task.files[] 之外的文件 → REJECT 并触发 fallback/重试。
 *
 * 为什么用 git 而非纯哈希:
 *   - git 已经把 changed/new/deleted 分类好，零成本复用
 *   - 涵盖新建 / 删除 / 修改 / rename 四种情况
 *   - 对 .gitignore 忠实（不会被 node_modules 干扰）
 *   - 若项目不是 git 仓库，降级为 mtime 比对
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface HashSnapshot {
  kind: 'git' | 'mtime' | 'unavailable';
  /** Changed files as reported by git at snapshot time (relative to projectDir). */
  changedFiles: Set<string>;
  /** mtime fallback: path → mtimeMs at snapshot time. */
  mtimes: Record<string, number>;
}

export interface HashVerifyResult {
  ok: boolean;
  /** Files modified during exec (computed as post \ pre). */
  actuallyTouched: string[];
  /** Files touched but NOT declared in task.files — these are violations. */
  collateralDamage: string[];
  /** Files declared but NOT actually touched — soft warning, not a failure. */
  undeclaredDeclared: string[];
  reason: string;
}

function isGitRepo(projectDir: string): boolean {
  try {
    // Use --show-toplevel and compare — guards against parent-dir git repos
    const top = execSync('git rev-parse --show-toplevel', { cwd: projectDir, stdio: 'pipe' })
      .toString().trim();
    const norm = (p: string) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
    return norm(top) === norm(projectDir);
  } catch { return false; }
}

function gitChangedFiles(projectDir: string): Set<string> {
  try {
    const out = execSync('git status --porcelain', { cwd: projectDir, stdio: 'pipe' }).toString();
    const files = new Set<string>();
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) continue;
      // Format: "XY path" or "XY path -> newpath" for renames
      const rest = line.slice(3).trim();
      const parts = rest.split(' -> ');
      files.add(parts[parts.length - 1].replace(/^"|"$/g, ''));
    }
    return files;
  } catch {
    return new Set();
  }
}

function mtimeSnapshot(projectDir: string, files: string[]): Record<string, number> {
  const mtimes: Record<string, number> = {};
  for (const f of files) {
    try {
      const st = fs.statSync(path.join(projectDir, f));
      mtimes[f] = st.mtimeMs;
    } catch { /* file may not exist yet */ }
  }
  return mtimes;
}

/** Capture pre-execution snapshot. */
export function snapshot(projectDir: string, declaredFiles: string[]): HashSnapshot {
  if (isGitRepo(projectDir)) {
    return {
      kind: 'git',
      changedFiles: gitChangedFiles(projectDir),
      mtimes: {},
    };
  }
  return {
    kind: 'mtime',
    changedFiles: new Set(),
    mtimes: mtimeSnapshot(projectDir, declaredFiles),
  };
}

/** Verify post-execution state against pre-snapshot and declared file list. */
export function verify(
  projectDir: string,
  pre: HashSnapshot,
  declaredFiles: string[],
): HashVerifyResult {
  const declared = new Set(declaredFiles.map(f => normalize(f)));

  if (pre.kind === 'git') {
    const post = gitChangedFiles(projectDir);
    const touched: string[] = [];
    for (const f of post) {
      if (!pre.changedFiles.has(f)) touched.push(normalize(f));
    }
    const collateral = touched.filter(f => !inDeclared(f, declared));
    const undeclared: string[] = [];
    for (const d of declared) {
      if (!touched.includes(d)) {
        // Might still be fine if file pre-existed in changedFiles (was edited before and still is)
        const wasAlready = pre.changedFiles.has(d);
        if (!wasAlready) undeclared.push(d);
      }
    }
    return {
      ok: collateral.length === 0,
      actuallyTouched: touched,
      collateralDamage: collateral,
      undeclaredDeclared: undeclared,
      reason: collateral.length === 0
        ? `touched ${touched.length} file(s), all declared`
        : `collateral damage: ${collateral.length} undeclared file(s) modified`,
    };
  }

  if (pre.kind === 'mtime') {
    const touched: string[] = [];
    for (const f of declaredFiles) {
      try {
        const st = fs.statSync(path.join(projectDir, f));
        const preT = pre.mtimes[f];
        if (preT === undefined || st.mtimeMs > preT) touched.push(normalize(f));
      } catch { /* file missing post-exec */ }
    }
    // mtime mode cannot detect collateral (would need full-tree scan); just verify declared-touched
    return {
      ok: true,
      actuallyTouched: touched,
      collateralDamage: [],
      undeclaredDeclared: declaredFiles.filter(f => !touched.includes(normalize(f))),
      reason: 'mtime mode (no collateral detection available)',
    };
  }

  return {
    ok: true,
    actuallyTouched: [],
    collateralDamage: [],
    undeclaredDeclared: [],
    reason: 'snapshot unavailable',
  };
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

function inDeclared(file: string, declared: Set<string>): boolean {
  if (declared.has(file)) return true;
  // Allow prefix match for directory-level declarations (e.g., declared "src/auth/" covers "src/auth/foo.ts")
  for (const d of declared) {
    if (d.endsWith('/') && file.startsWith(d)) return true;
  }
  return false;
}
