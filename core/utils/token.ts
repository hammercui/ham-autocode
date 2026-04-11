// core/utils/token.ts
import fs from 'fs';
import path from 'path';
import type { FileIndex } from '../types.js';

/** Estimate token count from text (chars / 4, ~20-30% error margin) */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Estimate tokens for a file by path */
export function estimateFileTokens(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return estimateTokens(content);
  } catch {
    return 0;
  }
}

/** Build file index with token estimates for a directory */
export function buildFileIndex(
  rootDir: string,
  extensions: string[] = ['.js', '.ts', '.py', '.md', '.json'],
): FileIndex {
  const index: FileIndex = {};
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        walk(full);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        const rel = path.relative(rootDir, full).replace(/\\/g, '/');
        index[rel] = { tokens: estimateFileTokens(full), size: fs.statSync(full).size };
      }
    }
  }
  walk(rootDir);
  return index;
}
