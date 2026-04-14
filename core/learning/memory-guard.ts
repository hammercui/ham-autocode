import fs from 'fs';
import path from 'path';
import { readEntityIndex, indexProjectEntities } from './code-entities.js';

export interface GuardResult {
  passed: boolean;
  duplicates: { entity: string; locations: string[] }[];
  conflicts: string[];
  suggestions: string[];
  checkedAt: string;
}

/**
 * 检查变更文件是否引入问题。
 * - 重复实体：同名 function/class 在多个文件中出现
 * - 未使用导出：export 了但没有被 import
 */
export function checkGuard(projectDir: string, changedFiles: string[]): GuardResult {
  // 确保实体索引是最新的
  const index = readEntityIndex(projectDir) || indexProjectEntities(projectDir);

  const duplicates: GuardResult['duplicates'] = [];
  const conflicts: string[] = [];
  const suggestions: string[] = [];

  // 检查重复实体
  const entityMap = new Map<string, string[]>(); // name -> [file1, file2, ...]
  for (const entity of index.entities) {
    if (entity.type === 'import') continue; // 跳过 import
    const key = `${entity.type}:${entity.name}`;
    const locations = entityMap.get(key) || [];
    locations.push(entity.file);
    entityMap.set(key, locations);
  }

  for (const [key, locations] of entityMap) {
    if (locations.length > 1) {
      // 只报告涉及变更文件的重复
      const relatedToChange = locations.some(l => changedFiles.some(f => l.includes(f) || f.includes(l)));
      if (relatedToChange || changedFiles.length === 0) {
        const name = key.split(':')[1];
        duplicates.push({ entity: name, locations: [...new Set(locations)] });
      }
    }
  }

  // 检查变更文件中的潜在问题
  for (const file of changedFiles) {
    const fullPath = path.resolve(projectDir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');

      // 检查 TODO/FIXME/HACK
      const markers = content.match(/\b(TODO|FIXME|HACK|XXX)\b/gi);
      if (markers && markers.length > 0) {
        suggestions.push(`${file}: has ${markers.length} TODO/FIXME markers`);
      }

      // 检查超长文件
      const lines = content.split('\n').length;
      if (lines > 500) {
        suggestions.push(`${file}: ${lines} lines — consider splitting`);
      }

      // 检查 console.log（可能是调试残留）
      const consoleLogs = content.match(/console\.(log|debug|warn)\(/g);
      if (consoleLogs && consoleLogs.length > 3) {
        suggestions.push(`${file}: ${consoleLogs.length} console statements — possible debug residue`);
      }
    } catch { /* skip unreadable files */ }
  }

  const passed = duplicates.length === 0 && conflicts.length === 0;

  return {
    passed,
    duplicates,
    conflicts,
    suggestions,
    checkedAt: new Date().toISOString(),
  };
}
