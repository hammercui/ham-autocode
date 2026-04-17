/**
 * v4.1 Todo Enforcer — L2.5 门禁，防止 agent "looks good, skip" 式提前退出。
 *
 * 核心思想（对标 oh-my-openagent Todo 强制执行）:
 *   task.files[] 是 spec 显式承诺"将修改这些文件"。执行后若任一文件缺失、
 *   空占位或无实质代码，判定为"todo 未完成"，reject 触发重试。
 *
 * 与 Hashline 的职责边界:
 *   L0.5 Hashline       → 禁止"改错东西"（写到未声明文件）
 *   L2.5 TodoEnforcer   → 要求"改了该改的"（声明文件必须有实质内容）
 *
 * 不试图做:
 *   - 解析 agent 自报 "[x] todo done"（opencode 无结构化输出，不可靠）
 *   - NLP 判断 acceptance clause 是否被满足（L2 spec keywords 已覆盖 export 匹配）
 */

import fs from 'fs';
import path from 'path';

export interface TodoCheckResult {
  ok: boolean;
  missing: string[];        // file declared but not on disk
  empty: string[];          // on disk but < MIN_BYTES after trim
  trivial: string[];        // code file but contains no meaningful construct
  reason: string;
}

/** 最小字节阈值：去除空白后少于此值视为空占位。
 *  20 chars ≈ 最短有意义的代码行 (如 `export const x=1`) */
const MIN_BYTES = 20;

/** 源代码文件扩展名 — 这类文件额外要求有意义的语法结构 */
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);

/** 至少匹配一个此类模式才算"有实质代码" */
const MEANINGFUL_PATTERNS = [
  /\bexport\s+(?:default\s+)?(?:function|const|let|var|class|interface|type|enum|async)\b/,
  /\bimport\s+.*\bfrom\b/,
  /\bmodule\.exports\b/,
  /\brequire\s*\(/,
  /\bfunction\s+\w+\s*\(/,
  /\bclass\s+\w+\b/,
];

export function enforceTodos(projectDir: string, declaredFiles: string[]): TodoCheckResult {
  const missing: string[] = [];
  const empty: string[] = [];
  const trivial: string[] = [];

  for (const f of declaredFiles) {
    const full = path.resolve(projectDir, f);
    if (!fs.existsSync(full)) {
      missing.push(f);
      continue;
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      missing.push(f);
      continue;
    }
    if (stat.isDirectory()) continue; // directory declarations (with trailing /) are treated as satisfied by Hashline
    let content = '';
    try {
      content = fs.readFileSync(full, 'utf-8');
    } catch {
      empty.push(f);
      continue;
    }
    const stripped = content.replace(/\s+/g, '');
    if (stripped.length < MIN_BYTES) {
      empty.push(f);
      continue;
    }
    const ext = path.extname(f).toLowerCase();
    if (CODE_EXTS.has(ext)) {
      const hasMeaning = MEANINGFUL_PATTERNS.some(p => p.test(content));
      if (!hasMeaning) trivial.push(f);
    }
  }

  const ok = missing.length === 0 && empty.length === 0 && trivial.length === 0;
  const parts: string[] = [];
  if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
  if (empty.length) parts.push(`empty (<${MIN_BYTES}B): ${empty.join(', ')}`);
  if (trivial.length) parts.push(`no meaningful code: ${trivial.join(', ')}`);
  return {
    ok,
    missing,
    empty,
    trivial,
    reason: ok ? `${declaredFiles.length} declared file(s) all satisfied` : parts.join('; '),
  };
}
