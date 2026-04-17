// core/context/summary-cache.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';
import { CONTEXT_SUMMARIES } from '../paths.js';

export interface FileSummary {
  path: string;
  hash: string;
  tokens: number;        // 原始 token 数（chars/4）
  summary: string;       // 压缩摘要
  summaryTokens: number; // 摘要 token 数
  savedPercent: number;
}

interface SummaryCache {
  schemaVersion: number;
  entries: Record<string, FileSummary>;
}

function cachePath(projectDir: string): string {
  return path.join(projectDir, CONTEXT_SUMMARIES);
}

function fileHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 12);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * 从文件内容提取摘要（提取签名而非全文）
 * TypeScript/JavaScript: export + class + function + interface 签名
 * Markdown: 标题 + 第一段
 * JSON: 顶层 key 结构
 * 其他: 前 30 行
 */
export function extractSummary(content: string, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const lines = content.split('\n');

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    // 提取 export/class/function/interface/type 签名
    const signatures: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^export\s+(default\s+)?(function|class|interface|type|enum|const|let|var)\s/.test(trimmed)) {
        signatures.push(trimmed.replace(/\{[\s\S]*$/, '{...}').substring(0, 200));
      } else if (/^(export\s+)?(?:async\s+)?function\s/.test(trimmed)) {
        signatures.push(trimmed.replace(/\{[\s\S]*$/, '{...}').substring(0, 200));
      } else if (/^(export\s+)?class\s/.test(trimmed)) {
        signatures.push(trimmed.replace(/\{[\s\S]*$/, '{...}').substring(0, 200));
      } else if (/^(export\s+)?interface\s/.test(trimmed)) {
        signatures.push(trimmed.replace(/\{[\s\S]*$/, '{...}').substring(0, 200));
      } else if (/^(export\s+)?type\s/.test(trimmed)) {
        signatures.push(trimmed.substring(0, 200));
      } else if (/^import\s/.test(trimmed)) {
        signatures.push(trimmed.substring(0, 200));
      }
    }
    return signatures.length > 0
      ? `// ${filePath} (${lines.length} lines)\n` + signatures.join('\n')
      : lines.slice(0, 30).join('\n');
  }

  if (['.md', '.markdown'].includes(ext)) {
    // 标题 + 每个标题下的第一段
    const headings: string[] = [];
    for (let i = 0; i < lines.length && headings.length < 20; i++) {
      if (lines[i].startsWith('#')) {
        headings.push(lines[i]);
        // 取标题后第一个非空行
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim()) {
            headings.push(lines[j].trim().substring(0, 100));
            break;
          }
        }
      }
    }
    return headings.join('\n') || lines.slice(0, 20).join('\n');
  }

  if (ext === '.json') {
    try {
      const obj = JSON.parse(content) as Record<string, unknown>;
      const keys = Object.keys(obj);
      return `// ${filePath} (JSON, ${keys.length} keys)\n// Keys: ${keys.slice(0, 20).join(', ')}`;
    } catch {
      return lines.slice(0, 10).join('\n');
    }
  }

  // 默认：前 30 行
  return lines.slice(0, 30).join('\n');
}

/**
 * 获取文件摘要（带缓存）
 * 文件未变化时复用缓存（基于 hash）
 */
export function summarizeFile(projectDir: string, filePath: string): FileSummary {
  const fullPath = path.resolve(projectDir, filePath);
  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return { path: filePath, hash: '', tokens: 0, summary: '', summaryTokens: 0, savedPercent: 0 };
  }

  const hash = fileHash(content);
  const tokens = estimateTokens(content);

  // 小文件（<200 tokens）不需要摘要
  if (tokens < 200) {
    return { path: filePath, hash, tokens, summary: content, summaryTokens: tokens, savedPercent: 0 };
  }

  // 检查缓存
  const { data: cache } = readJSON<SummaryCache>(cachePath(projectDir));
  if (cache?.entries[filePath]?.hash === hash) {
    return cache.entries[filePath];
  }

  // 生成摘要
  const summary = extractSummary(content, filePath);
  const summaryTokens = estimateTokens(summary);
  const savedPercent = Math.round((1 - summaryTokens / tokens) * 100);

  const result: FileSummary = { path: filePath, hash, tokens, summary, summaryTokens, savedPercent };

  // 更新缓存
  const newCache: SummaryCache = {
    schemaVersion: 1,
    entries: { ...(cache?.entries || {}), [filePath]: result },
  };
  const dir = path.dirname(cachePath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteJSON(cachePath(projectDir), newCache);

  return result;
}

/**
 * 智能获取：在 token 预算内返回摘要或全文
 */
export function getSummaryOrFull(projectDir: string, filePath: string, tokenBudget: number): { content: string; tokens: number; usedSummary: boolean } {
  const fullPath = path.resolve(projectDir, filePath);
  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return { content: '', tokens: 0, usedSummary: false };
  }

  const tokens = estimateTokens(content);

  // 如果全文在预算内，返回全文
  if (tokens <= tokenBudget) {
    return { content, tokens, usedSummary: false };
  }

  // 否则返回摘要
  const summary = summarizeFile(projectDir, filePath);
  return { content: summary.summary, tokens: summary.summaryTokens, usedSummary: true };
}
