import fs from 'fs';
import path from 'path';
import type { TaskState } from '../types.js';
import { detectOpenSpec } from './reader.js';

export interface SyncResult {
  taskId: string;
  synced: boolean;
  changeName?: string;
  mergedSpecs: string[];
  archived: boolean;
  error?: string;
}

/**
 * 将 change 的 delta specs 合并到 source of truth specs
 * 然后标记 change 为 archived（重命名目录加 .archived 后缀）
 */
export function syncSpec(projectDir: string, taskId: string, task: TaskState): SyncResult {
  const project = detectOpenSpec(projectDir);
  if (!project.hasOpenSpec) {
    return { taskId, synced: false, mergedSpecs: [], archived: false, error: 'No openspec/ directory found' };
  }

  // 尝试找到匹配的 change
  const taskNameLower = task.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const matchedChange = project.changes.find(c => {
    const changeLower = c.name.toLowerCase();
    return taskNameLower.includes(changeLower) || changeLower.includes(taskNameLower.slice(0, 15));
  });

  if (!matchedChange) {
    return { taskId, synced: false, mergedSpecs: [], archived: false, error: 'No matching change found' };
  }

  const changeDir = matchedChange.path;
  const specsSourceDir = path.join(changeDir, 'specs');
  const specsTargetDir = path.join(projectDir, 'openspec', 'specs');
  const mergedSpecs: string[] = [];

  // 合并 delta specs 到 source of truth
  if (fs.existsSync(specsSourceDir)) {
    const copyRecursive = (src: string, dest: string): void => {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyRecursive(srcPath, destPath);
        } else {
          // 对于 spec.md，追加 delta 内容而不是覆盖
          if (entry.name === 'spec.md' && fs.existsSync(destPath)) {
            const existing = fs.readFileSync(destPath, 'utf8');
            const delta = fs.readFileSync(srcPath, 'utf8');
            // 追加 delta 内容（去重标题）
            const merged = existing.trimEnd() + '\n\n---\n\n' + delta;
            fs.writeFileSync(destPath, merged);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
          mergedSpecs.push(path.relative(projectDir, destPath));
        }
      }
    };
    copyRecursive(specsSourceDir, specsTargetDir);
  }

  // Archive the change（重命名为 .archived）
  let archived = false;
  try {
    const archivedPath = changeDir + '.archived';
    if (!fs.existsSync(archivedPath)) {
      fs.renameSync(changeDir, archivedPath);
      archived = true;
    }
  } catch {
    // archive 失败不阻塞
  }

  return {
    taskId,
    synced: true,
    changeName: matchedChange.name,
    mergedSpecs,
    archived,
  };
}
