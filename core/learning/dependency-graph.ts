import fs from 'fs';
import path from 'path';
import { atomicWriteJSON, readJSON } from '../state/atomic.js';

export interface DependencyEdge {
  from: string;  // file path
  to: string;    // imported module
  type: 'imports' | 'dynamic-import';
}

export interface DependencyGraph {
  schemaVersion: number;
  builtAt: string;
  totalFiles: number;
  totalEdges: number;
  edges: DependencyEdge[];
}

function graphPath(projectDir: string): string {
  return path.join(projectDir, '.ham-autocode', 'learning', 'dependency-graph.json');
}

/**
 * 从文件内容提取 import 依赖
 */
function extractImports(content: string, filePath: string): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Static imports: import ... from '...'
    const staticMatch = trimmed.match(/^import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?\s+from\s+['"]([^'"]+)['"]/);
    if (staticMatch) {
      edges.push({ from: filePath, to: staticMatch[1], type: 'imports' });
      continue;
    }

    // Re-exports: export ... from '...'
    const reExportMatch = trimmed.match(/^export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/);
    if (reExportMatch) {
      edges.push({ from: filePath, to: reExportMatch[1], type: 'imports' });
      continue;
    }

    // Dynamic imports: import('...')  or await import('...')
    const dynamicMatch = trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynamicMatch) {
      edges.push({ from: filePath, to: dynamicMatch[1], type: 'dynamic-import' });
    }
  }

  return edges;
}

/**
 * 构建整个项目的依赖图
 */
export function buildDependencyGraph(projectDir: string): DependencyGraph {
  const edges: DependencyEdge[] = [];
  const files = new Set<string>();

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
            files.add(relPath);
            edges.push(...extractImports(content, relPath));
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  };
  walk(projectDir, 0);

  const graph: DependencyGraph = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    totalFiles: files.size,
    totalEdges: edges.length,
    edges,
  };

  // Persist
  const dir = path.dirname(graphPath(projectDir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteJSON(graphPath(projectDir), graph);

  return graph;
}

/**
 * 读取已构建的依赖图
 */
export function readDependencyGraph(projectDir: string): DependencyGraph | null {
  const { data } = readJSON<DependencyGraph>(graphPath(projectDir));
  return data;
}

/**
 * 查找文件的直接依赖（imports）和被依赖（imported by）
 */
export function fileDependencies(projectDir: string, filePath: string): { imports: string[]; importedBy: string[] } {
  const graph = readDependencyGraph(projectDir);
  if (!graph) return { imports: [], importedBy: [] };

  const imports = graph.edges
    .filter(e => e.from === filePath)
    .map(e => e.to);

  const importedBy = graph.edges
    .filter(e => e.to.includes(path.basename(filePath, path.extname(filePath))))
    .map(e => e.from);

  return { imports: [...new Set(imports)], importedBy: [...new Set(importedBy)] };
}

/**
 * 查找变更影响范围：给定一组文件，找出所有可能受影响的文件
 */
export function impactAnalysis(projectDir: string, changedFiles: string[]): string[] {
  const graph = readDependencyGraph(projectDir);
  if (!graph) return [];

  const affected = new Set<string>(changedFiles);
  const queue = [...changedFiles];

  // BFS: 找所有直接或间接依赖这些文件的文件
  while (queue.length > 0) {
    const current = queue.shift()!;
    const basename = path.basename(current, path.extname(current));
    const dependents = graph.edges
      .filter(e => e.to.includes(basename) && !affected.has(e.from))
      .map(e => e.from);

    for (const dep of dependents) {
      affected.add(dep);
      queue.push(dep);
    }
  }

  // Remove original files from result
  for (const f of changedFiles) affected.delete(f);
  return [...affected];
}
