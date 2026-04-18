/**
 * 波次 git commit — v4.2 拆分。
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { readTask } from '../../state/task-graph.js';
import type { TaskExecResult } from './types.js';

/** Git commit 本波产出 */
export function commitWave(projectDir: string, waveNum: number, results: TaskExecResult[]): string | null {
  const okResults = results.filter(r => r.result === 'ok');
  if (okResults.length === 0) return null;

  const filesToAdd: string[] = [];
  for (const r of okResults) {
    const task = readTask(projectDir, r.taskId);
    if (task?.files) {
      for (const f of task.files) {
        if (fs.existsSync(path.resolve(projectDir, f))) {
          filesToAdd.push(f);
        }
      }
    }
  }

  if (filesToAdd.length === 0) return null;

  try {
    execSync(`git add ${filesToAdd.map(f => `"${f}"`).join(' ')}`, { cwd: projectDir, stdio: 'pipe' });

    const taskIds = okResults.map(r => r.taskId).join(', ');
    const agentStats: Record<string, number> = {};
    for (const r of okResults) {
      agentStats[r.agent] = (agentStats[r.agent] || 0) + 1;
    }
    const agentSummary = Object.entries(agentStats).map(([a, n]) => `${a}(${n})`).join(', ');
    const totalDuration = okResults.reduce((sum, r) => sum + r.durationMs, 0);

    const msg = `feat: auto-execute wave ${waveNum} — ${taskIds}\n\nAgent: ${agentSummary}\nDuration: ${Math.round(totalDuration / 1000)}s\nFiles: ${filesToAdd.length}`;
    execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: projectDir, stdio: 'pipe' });

    const hash = execSync('git rev-parse --short HEAD', { cwd: projectDir, stdio: 'pipe' }).toString().trim();
    return hash;
  } catch {
    return null;
  }
}
