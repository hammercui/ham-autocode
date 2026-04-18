/**
 * v4.2 Hierarchical CONTEXT.md — per-directory LSP symbol tree.
 *
 * Build:   ham-cli context build     — scan workspace via LSP, write tree/*.md
 * Inject:  HAM_HIERARCHICAL_CONTEXT=1 — buildMinimalContext 末尾拼接
 * Query:   ham-cli context for-task <id> — 给任务的 Files: 组装上溯 context
 *
 * Storage: .ham-autocode/state/context/tree/<flat_path>.md
 *   where `flat_path` = `dir.replace(/[\/\\]/g, '_')`  (e.g. app_src_renderer_lib)
 *   root dir → `_root.md`
 *
 * 无入侵：所有 context 文件都落在 .ham-autocode/ 内，源目录不产生 CONTEXT.md。
 */

import fs from 'fs';
import path from 'path';
import { LspClient, SymbolKind } from '../lsp/client.js';
import type { DocumentSymbol } from '../lsp/client.js';
import { STATE_CONTEXT } from '../paths.js';

// ─── Config ────────────────────────────────────────────────

const INCLUDE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.ham-autocode', '.planning', 'coverage']);

/** 每个目录 CONTEXT 硬上限（字符，近似 tokens）。防止超大目录把 spec context 挤爆。 */
const DIR_CONTEXT_MAX_CHARS = 3200;  // ~800 tokens

/** 任务 for-files 拼接总上限。 */
const TASK_CONTEXT_MAX_CHARS = 12000;  // ~3000 tokens

// ─── Types ─────────────────────────────────────────────────

export interface SymbolSummary {
  name: string;
  kind: SymbolKind;
  line: number;
  file: string;  // 相对 projectDir
}

export interface DirContext {
  dirRel: string;              // 相对 projectDir，如 'app/src/renderer/lib'
  files: { file: string; symbols: SymbolSummary[] }[];
}

// ─── File discovery ────────────────────────────────────────

function walkDir(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(full, out);
    else if (e.isFile() && INCLUDE_EXT.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

// ─── Symbol extraction ─────────────────────────────────────

/** Flatten hierarchical DocumentSymbol[] to a flat top-level summary list. */
function flattenTopLevel(syms: DocumentSymbol[], fileRel: string): SymbolSummary[] {
  // Only keep top-level symbols; nested method/field detail is noise for context injection.
  return syms.map(s => ({
    name: s.name,
    kind: s.kind,
    line: s.range.start.line + 1,
    file: fileRel,
  }));
}

/** LSP SymbolKind → short label for markdown. */
function kindLabel(kind: SymbolKind): string {
  switch (kind) {
    case SymbolKind.Class: return 'class';
    case SymbolKind.Interface: return 'interface';
    case SymbolKind.Enum: return 'enum';
    case SymbolKind.Function: return 'fn';
    case SymbolKind.Method: return 'method';
    case SymbolKind.Variable: return 'var';
    case SymbolKind.Constant: return 'const';
    case SymbolKind.Property: return 'prop';
    case SymbolKind.TypeParameter: return 'type';
    case SymbolKind.Namespace: return 'namespace';
    case SymbolKind.Module: return 'module';
    case SymbolKind.Struct: return 'struct';
    default: return `k${kind}`;
  }
}

// ─── Build tree ────────────────────────────────────────────

/**
 * Scan workspace via LSP, write per-directory CONTEXT files under
 * .ham-autocode/state/context/tree/.
 * Returns the number of dirs/files processed.
 */
export async function buildTreeContext(
  projectDir: string,
  opts: { serverCmd?: string; log?: (msg: string) => void } = {},
): Promise<{ dirs: number; files: number; symbols: number }> {
  const log = opts.log || (() => { /* silent */ });
  const files = walkDir(projectDir);
  log(`scanned ${files.length} source files`);

  if (files.length === 0) return { dirs: 0, files: 0, symbols: 0 };

  const client = new LspClient();
  await client.start(projectDir, opts.serverCmd);

  // Group by dir (relative)
  const byDir = new Map<string, { file: string; symbols: SymbolSummary[] }[]>();
  let totalSymbols = 0;

  try {
    for (const full of files) {
      const rel = path.relative(projectDir, full).replace(/\\/g, '/');
      const dirRel = path.dirname(rel).replace(/\\/g, '/');
      let text: string;
      try { text = fs.readFileSync(full, 'utf-8'); } catch { continue; }
      const langId = full.endsWith('.tsx') ? 'typescriptreact'
        : full.endsWith('.ts') ? 'typescript'
        : full.endsWith('.jsx') ? 'javascriptreact'
        : 'javascript';
      try {
        await client.openFile(full, langId, text);
        const syms = await client.documentSymbol(full);
        const summary = flattenTopLevel(syms, rel);
        if (summary.length === 0) continue;
        totalSymbols += summary.length;
        const list = byDir.get(dirRel) || [];
        list.push({ file: rel, symbols: summary });
        byDir.set(dirRel, list);
      } catch (e) {
        log(`skip ${rel}: ${(e as Error).message.slice(0, 100)}`);
      }
    }
  } finally {
    await client.shutdown();
  }

  // Ensure output dir
  const outDir = path.join(projectDir, STATE_CONTEXT, 'tree');
  fs.mkdirSync(outDir, { recursive: true });

  // Clear old tree files (idempotent rebuild)
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.md')) try { fs.unlinkSync(path.join(outDir, f)); } catch { /* */ }
  }

  // Render markdown per dir
  let dirsWritten = 0;
  for (const [dirRel, entries] of byDir) {
    const md = renderDirMd(dirRel, entries);
    const flatName = dirToFlatName(dirRel);
    fs.writeFileSync(path.join(outDir, `${flatName}.md`), md, 'utf-8');
    dirsWritten++;
  }

  log(`wrote ${dirsWritten} CONTEXT files under ${path.relative(projectDir, outDir)}`);
  return { dirs: dirsWritten, files: files.length, symbols: totalSymbols };
}

function renderDirMd(dirRel: string, entries: { file: string; symbols: SymbolSummary[] }[]): string {
  const title = dirRel === '.' ? '(project root)' : dirRel;
  const lines = [`# ${title}`, ''];
  // files sorted alphabetically; symbols by appearance line
  entries.sort((a, b) => a.file.localeCompare(b.file));
  for (const e of entries) {
    lines.push(`## ${path.basename(e.file)}`);
    const sorted = [...e.symbols].sort((a, b) => a.line - b.line);
    for (const s of sorted) {
      lines.push(`- ${kindLabel(s.kind)} \`${s.name}\` (L${s.line})`);
    }
    lines.push('');
  }
  const result = lines.join('\n');
  // Hard cap (token budget)
  if (result.length > DIR_CONTEXT_MAX_CHARS) {
    return result.slice(0, DIR_CONTEXT_MAX_CHARS - 40) + '\n\n...[truncated — dir too large]';
  }
  return result;
}

function dirToFlatName(dirRel: string): string {
  if (dirRel === '.' || dirRel === '') return '_root';
  return dirRel.replace(/[\/\\]/g, '_');
}

// ─── Lookup / compose ──────────────────────────────────────

/**
 * Given a task's Files:, collect the unique set of ancestor directories
 * (each file's dir + all parents up to project root) and return concatenated
 * CONTEXT markdown. Truncates to TASK_CONTEXT_MAX_CHARS.
 */
export function contextForFiles(projectDir: string, files: string[]): string {
  const treeDir = path.join(projectDir, STATE_CONTEXT, 'tree');
  if (!fs.existsSync(treeDir)) return '';

  const dirs = new Set<string>();
  for (const f of files) {
    const norm = f.replace(/\\/g, '/');
    let d = path.dirname(norm);
    while (d && d !== '.' && d !== '/') {
      dirs.add(d);
      const parent = path.dirname(d);
      if (parent === d) break;
      d = parent;
    }
    dirs.add('.');  // root always
  }

  const parts: string[] = [];
  let used = 0;
  // Order: from nearest (deepest) dir to root → keeps most relevant first under char budget
  const ordered = [...dirs].sort((a, b) => b.split('/').length - a.split('/').length);
  for (const d of ordered) {
    const flat = dirToFlatName(d);
    const file = path.join(treeDir, `${flat}.md`);
    if (!fs.existsSync(file)) continue;
    const md = fs.readFileSync(file, 'utf-8');
    if (used + md.length > TASK_CONTEXT_MAX_CHARS) {
      const remain = TASK_CONTEXT_MAX_CHARS - used;
      if (remain < 200) break;
      parts.push(md.slice(0, remain) + '\n\n...[truncated — task context budget reached]');
      break;
    }
    parts.push(md);
    used += md.length;
  }
  return parts.join('\n\n---\n\n');
}
