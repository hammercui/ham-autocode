import fs from 'fs';
import path from 'path';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';

export interface CodeEntity {
  type: 'function' | 'class' | 'interface' | 'type' | 'export' | 'import' | 'enum';
  name: string;
  file: string;
  line: number;
  signature: string;
}

interface EntityIndex {
  schemaVersion: number;
  indexedAt: string;
  totalEntities: number;
  entities: CodeEntity[];
}

function indexPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'learning', 'entities.json');
}

/**
 * 从 TypeScript/JavaScript 文件内容提取代码实体
 */
export function extractEntities(content: string, filePath: string): CodeEntity[] {
  const entities: CodeEntity[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // export function xxx / export async function xxx
    let match = line.match(/^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/);
    if (match) { entities.push({ type: 'function', name: match[1], file: filePath, line: lineNum, signature: line.substring(0, 200) }); continue; }

    // export class xxx
    match = line.match(/^export\s+(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (match) { entities.push({ type: 'class', name: match[1], file: filePath, line: lineNum, signature: line.substring(0, 200) }); continue; }

    // export interface xxx
    match = line.match(/^export\s+(?:default\s+)?interface\s+(\w+)/);
    if (match) { entities.push({ type: 'interface', name: match[1], file: filePath, line: lineNum, signature: line.substring(0, 200) }); continue; }

    // export type xxx
    match = line.match(/^export\s+(?:default\s+)?type\s+(\w+)/);
    if (match) { entities.push({ type: 'type', name: match[1], file: filePath, line: lineNum, signature: line.substring(0, 200) }); continue; }

    // export enum xxx
    match = line.match(/^export\s+(?:default\s+)?enum\s+(\w+)/);
    if (match) { entities.push({ type: 'enum', name: match[1], file: filePath, line: lineNum, signature: line.substring(0, 200) }); continue; }

    // Non-export function/class (module-level)
    match = line.match(/^(?:async\s+)?function\s+(\w+)/);
    if (match && !line.startsWith('//')) { entities.push({ type: 'function', name: match[1], file: filePath, line: lineNum, signature: line.substring(0, 200) }); continue; }

    match = line.match(/^(?:abstract\s+)?class\s+(\w+)/);
    if (match && !line.startsWith('//')) { entities.push({ type: 'class', name: match[1], file: filePath, line: lineNum, signature: line.substring(0, 200) }); continue; }

    // import statements
    match = line.match(/^import\s+(?:type\s+)?(?:\{[^}]+\}|\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (match) { entities.push({ type: 'import', name: match[1], file: filePath, line: lineNum, signature: line.substring(0, 200) }); }
  }

  return entities;
}

/**
 * 索引整个项目的代码实体
 */
export function indexProjectEntities(projectDir: string): EntityIndex {
  const entities: CodeEntity[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > 5) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            const relPath = path.relative(projectDir, full).replace(/\\/g, '/');
            entities.push(...extractEntities(content, relPath));
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip unreadable dirs */ }
  };
  walk(projectDir, 0);

  const index: EntityIndex = {
    schemaVersion: 1,
    indexedAt: new Date().toISOString(),
    totalEntities: entities.length,
    entities,
  };

  // Persist
  const dir = path.dirname(indexPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteJSON(indexPath(projectDir), index);

  return index;
}

/**
 * 读取已索引的实体
 */
export function readEntityIndex(projectDir: string): EntityIndex | null {
  const { data } = readJSON<EntityIndex>(indexPath(projectDir));
  return data;
}

/**
 * 搜索实体（按名称模糊匹配）
 */
export function searchEntities(projectDir: string, query: string): CodeEntity[] {
  const index = readEntityIndex(projectDir);
  if (!index) return [];
  const queryLower = query.toLowerCase();
  return index.entities.filter(e =>
    e.name.toLowerCase().includes(queryLower) ||
    e.file.toLowerCase().includes(queryLower)
  );
}
