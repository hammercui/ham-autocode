/**
 * Auto Runner — 全自动循环执行 DAG 剩余任务。
 *
 * 一条命令跑完整个 milestone：
 *   wave 循环 → spawn agent → 验证 → dag complete → commit → 下一波
 *
 * 触发方式: ham-cli execute auto (Claude Code / Claude App / 终端 / cron)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, execFileSync } from 'child_process';
import { readTask, readAllTasks } from '../state/task-graph.js';
import { buildMinimalContext } from './context-template.js';
import { appendAgentExec } from '../trace/logger.js';
import { verifyTaskOutput, preflightCheck } from './quality-gate.js';
import { getAvailableAgent, recordSuccess, recordFailure } from './agent-status.js';
import type { TaskState, RoutingTarget } from '../types.js';

// ==================== Types ====================

export interface AutoRunOptions {
  agent?: 'codex' | 'opencode';
  timeout?: number;         // ms, 默认 600000 (10 min)
  concurrency?: number;     // 最大并行数，默认无限制
  dryRun?: boolean;
  push?: boolean;
}

export interface TaskExecResult {
  taskId: string;
  taskName: string;
  agent: string;
  result: 'ok' | 'error' | 'skip';
  durationMs: number;
  filesCreated: number;
  filesModified: number;
  error?: string;
  fallbackUsed?: boolean;
  qualityPassed?: boolean;
}

export interface WaveResult {
  wave: number;
  tasks: TaskExecResult[];
  commitHash?: string;
}

export interface AutoRunResult {
  totalTasks: number;
  completed: number;
  failed: number;
  skipped: number;
  totalTimeMs: number;
  waves: WaveResult[];
}

// ==================== Helpers ====================

function log(msg: string): void {
  const time = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[auto ${time}] ${msg}\n`);
}

/** 获取 DAG 的 next-wave（直接调用 dag 模块） */
function getNextWave(projectDir: string): { id: string; name: string }[] {
  try {
    // 调用自身 CLI 避免循环依赖
    const output = execSync(
      `node "${path.join(__dirname, '..', 'index.js')}" dag next-wave`,
      { cwd: projectDir, env: { ...process.env, HAM_PROJECT_DIR: projectDir }, stdio: 'pipe', timeout: 10000 }
    ).toString().trim();
    return JSON.parse(output);
  } catch {
    return [];
  }
}

/** 标记任务完成 */
function dagComplete(projectDir: string, taskId: string): void {
  try {
    execSync(
      `node "${path.join(__dirname, '..', 'index.js')}" dag complete ${taskId}`,
      { cwd: projectDir, env: { ...process.env, HAM_PROJECT_DIR: projectDir }, stdio: 'pipe', timeout: 10000 }
    );
  } catch { /* best effort */ }
}

/** 获取 DAG 状态 */
function dagStatus(projectDir: string): { done: number; remaining: number; total: number } {
  try {
    const output = execSync(
      `node "${path.join(__dirname, '..', 'index.js')}" dag status`,
      { cwd: projectDir, env: { ...process.env, HAM_PROJECT_DIR: projectDir }, stdio: 'pipe', timeout: 10000 }
    ).toString().trim();
    return JSON.parse(output);
  } catch {
    return { done: 0, remaining: 0, total: 0 };
  }
}

/** 写 bundle 到临时文件 */
function writeBundleFile(taskId: string, instruction: string): string {
  const tmpFile = path.join(os.tmpdir(), `ham-bundle-${taskId}.txt`);
  fs.writeFileSync(tmpFile, instruction, 'utf-8');
  return tmpFile;
}

/** 检查文件变更 */
function checkFiles(projectDir: string, files: string[]): { created: number; modified: number } {
  let created = 0;
  let modified = 0;
  for (const f of files) {
    const fullPath = path.resolve(projectDir, f);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      // 最近 15 分钟内修改的算本次产出
      if (Date.now() - stat.mtimeMs < 15 * 60 * 1000) {
        created++;
      } else {
        modified++;
      }
    }
  }
  return { created, modified };
}

// ==================== Task Execution ====================

/** 执行单个任务（含 fallback） */
async function executeTask(
  projectDir: string,
  task: TaskState,
  options: AutoRunOptions
): Promise<TaskExecResult> {
  const timeout = options.timeout || 600000;

  // 确定 agent
  const routedTarget: RoutingTarget = options.agent || task.routing?.target || 'codex';
  const fallbackChain = routedTarget === 'codex'
    ? ['codex', 'opencode']
    : ['opencode', 'codex'];

  for (let attempt = 0; attempt < fallbackChain.length; attempt++) {
    const agentName = options.agent
      ? options.agent  // 强制指定时不 fallback
      : getAvailableAgent(projectDir, fallbackChain[0], fallbackChain.slice(1)) || fallbackChain[0];

    // 生成 bundle
    const target = agentName as RoutingTarget;
    const minimal = buildMinimalContext(projectDir, task, target);
    const bundlePath = writeBundleFile(task.id, minimal.instruction);

    log(`${task.id} → ${agentName} ... spawned`);
    const startTime = Date.now();

    try {
      // 构建命令
      let cmd: string;
      let cmdArgs: string[];

      if (agentName === 'codex') {
        cmd = 'codex';
        cmdArgs = ['exec', '--full-auto'];
      } else {
        cmd = 'opencode';
        cmdArgs = ['run', '--dangerously-skip-permissions'];
      }

      // 执行: stdin 传入 bundle
      const bundleContent = fs.readFileSync(bundlePath, 'utf-8');
      execFileSync(cmd, cmdArgs, {
        cwd: projectDir,
        input: bundleContent,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      const durationMs = Date.now() - startTime;
      const { created, modified } = checkFiles(projectDir, task.files || []);

      // 质量门禁
      const quality = verifyTaskOutput(projectDir, task);

      if (quality.passed) {
        recordSuccess(projectDir, agentName);
        dagComplete(projectDir, task.id);
        appendAgentExec(projectDir, {
          time: new Date().toISOString(),
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'ok', duration_ms: durationMs,
          filesCreated: created, filesModified: modified,
        });

        log(`${task.id} ✓ ${Math.round(durationMs / 1000)}s (${agentName}, ${created} files created)`);
        return {
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'ok', durationMs, filesCreated: created, filesModified: modified,
          fallbackUsed: attempt > 0, qualityPassed: true,
        };
      }

      // 质量不通过
      log(`${task.id} ⚠ quality gate failed (${agentName}), ${quality.checks.filter(c => !c.passed).map(c => c.message).join(', ')}`);
      recordFailure(projectDir, agentName);

    } catch (e: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = e instanceof Error ? e.message.slice(0, 200) : 'unknown error';
      log(`${task.id} ✗ ${agentName} failed (${Math.round(durationMs / 1000)}s): ${errMsg}`);

      recordFailure(projectDir, agentName);
      appendAgentExec(projectDir, {
        time: new Date().toISOString(),
        taskId: task.id, taskName: task.name, agent: agentName,
        result: 'error', duration_ms: durationMs, error: errMsg,
      });
    }

    // 强制指定 agent 时不 fallback
    if (options.agent) break;

    // fallback: 尝试下一个 agent
    if (attempt < fallbackChain.length - 1) {
      log(`${task.id} → fallback to ${fallbackChain[attempt + 1]}`);
    }
  }

  // 全部失败 → skip
  log(`${task.id} ✗ skipped (all agents failed)`);
  return {
    taskId: task.id, taskName: task.name, agent: 'none',
    result: 'skip', durationMs: 0, filesCreated: 0, filesModified: 0,
  };
}

// ==================== Wave Execution ====================

/** Git commit 本波产出 */
function commitWave(projectDir: string, waveNum: number, results: TaskExecResult[]): string | null {
  const okResults = results.filter(r => r.result === 'ok');
  if (okResults.length === 0) return null;

  // 收集所有成功任务的文件
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
    // git add 具体文件
    execSync(`git add ${filesToAdd.map(f => `"${f}"`).join(' ')}`, { cwd: projectDir, stdio: 'pipe' });

    // 生成 commit message
    const taskIds = okResults.map(r => r.taskId).join(', ');
    const agentStats: Record<string, number> = {};
    for (const r of okResults) {
      agentStats[r.agent] = (agentStats[r.agent] || 0) + 1;
    }
    const agentSummary = Object.entries(agentStats).map(([a, n]) => `${a}(${n})`).join(', ');
    const totalDuration = okResults.reduce((sum, r) => sum + r.durationMs, 0);

    const msg = `feat: auto-execute wave ${waveNum} — ${taskIds}\n\nAgent: ${agentSummary}\nDuration: ${Math.round(totalDuration / 1000)}s\nFiles: ${filesToAdd.length}`;

    execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: projectDir, stdio: 'pipe' });

    // 获取 commit hash
    const hash = execSync('git rev-parse --short HEAD', { cwd: projectDir, stdio: 'pipe' }).toString().trim();
    return hash;
  } catch {
    return null;
  }
}

// ==================== Main ====================

export async function runAuto(projectDir: string, options: AutoRunOptions): Promise<AutoRunResult> {
  const startTime = Date.now();
  const waves: WaveResult[] = [];
  let totalCompleted = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  // DAG 状态
  const status = dagStatus(projectDir);
  log(`Starting auto-execution...`);
  log(`DAG: ${status.remaining} remaining, ${status.done} done, ${status.total} total`);

  if (status.remaining === 0) {
    log('All tasks already done!');
    return { totalTasks: 0, completed: 0, failed: 0, skipped: 0, totalTimeMs: 0, waves: [] };
  }

  // DAG 预检
  const allTasks = readAllTasks(projectDir);
  const pendingTasks = allTasks.filter(t => t.status !== 'done');
  const preflight = preflightCheck(projectDir, pendingTasks);
  if (preflight.warnings.length > 0) {
    for (const w of preflight.warnings) {
      log(`⚠ ${w.taskId}: ${w.issues.join(', ')}`);
    }
  }
  log(`Pre-flight: ${preflight.ready.length} ready, ${preflight.warnings.length} warnings`);

  if (options.dryRun) {
    log('Dry run — showing plan only:');
    let waveNum = 0;
    let wave = getNextWave(projectDir);
    while (wave.length > 0) {
      waveNum++;
      log(`Wave ${waveNum}: ${wave.map(t => t.id).join(', ')}`);
      // 不能继续模拟后续 wave（因为没实际执行）
      break;
    }
    return { totalTasks: status.remaining, completed: 0, failed: 0, skipped: 0, totalTimeMs: 0, waves: [] };
  }

  // 主循环
  let waveNum = 0;
  while (true) {
    const wave = getNextWave(projectDir);
    if (wave.length === 0) break;

    waveNum++;
    log(`\n=== Wave ${waveNum}: ${wave.length} tasks [${wave.map(t => t.id).join(', ')}] ===`);

    // 并行执行本波任务
    const concurrency = options.concurrency || wave.length;
    const results: TaskExecResult[] = [];

    // 按 concurrency 分批
    for (let i = 0; i < wave.length; i += concurrency) {
      const batch = wave.slice(i, i + concurrency);
      const promises = batch.map(async (w) => {
        const task = readTask(projectDir, w.id);
        if (!task) {
          return { taskId: w.id, taskName: w.name, agent: 'none', result: 'skip' as const, durationMs: 0, filesCreated: 0, filesModified: 0 };
        }
        return executeTask(projectDir, task, options);
      });
      const batchResults = await Promise.allSettled(promises);
      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          results.push(r.value);
        }
      }
    }

    // 统计
    const ok = results.filter(r => r.result === 'ok').length;
    const failed = results.filter(r => r.result === 'error').length;
    const skipped = results.filter(r => r.result === 'skip').length;
    totalCompleted += ok;
    totalFailed += failed;
    totalSkipped += skipped;

    // Git commit
    const commitHash = commitWave(projectDir, waveNum, results);
    if (commitHash) {
      log(`Git: committed ${commitHash}`);
    }

    log(`Wave ${waveNum}: ${ok}/${results.length} ok${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''}`);

    waves.push({ wave: waveNum, tasks: results, commitHash: commitHash || undefined });
  }

  // 最终汇总
  const totalTimeMs = Date.now() - startTime;
  const totalTasks = totalCompleted + totalFailed + totalSkipped;

  // agent 统计
  const agentStats: Record<string, { count: number; totalMs: number }> = {};
  for (const w of waves) {
    for (const t of w.tasks) {
      if (t.result === 'ok') {
        if (!agentStats[t.agent]) agentStats[t.agent] = { count: 0, totalMs: 0 };
        agentStats[t.agent].count++;
        agentStats[t.agent].totalMs += t.durationMs;
      }
    }
  }
  const agentSummary = Object.entries(agentStats)
    .map(([a, s]) => `${a}: ${s.count} tasks (avg ${Math.round(s.totalMs / s.count / 1000)}s)`)
    .join(' | ');

  log(`\n=== Complete ===`);
  log(`Total: ${totalTasks} tasks, ${totalCompleted} ok, ${totalFailed} failed, ${totalSkipped} skipped`);
  log(`Time: ${Math.round(totalTimeMs / 1000)}s | ${agentSummary}`);
  log(`Commits: ${waves.filter(w => w.commitHash).length}`);

  // push
  if (options.push) {
    try {
      execSync('git push', { cwd: projectDir, stdio: 'pipe', timeout: 30000 });
      log('Git: pushed to remote');
    } catch {
      log('Git: push failed');
    }
  }

  return { totalTasks, completed: totalCompleted, failed: totalFailed, skipped: totalSkipped, totalTimeMs, waves };
}
