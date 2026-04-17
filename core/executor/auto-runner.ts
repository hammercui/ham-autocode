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
import { execSync, spawn } from 'child_process';
import { readTask, readAllTasks } from '../state/task-graph.js';
import { buildMinimalContext } from './context-template.js';
import { appendAgentExec } from '../trace/logger.js';
import { verifyTaskOutput, preflightCheck, verifyProjectTsc } from './quality-gate.js';
import { reviewTaskOutput, writeReviewFeedback } from './review-gate.js';
import type { ReviewResult } from './review-gate.js';
import { getAvailableAgent, recordSuccess, recordFailure } from './agent-status.js';
import { loadConfig } from '../state/config.js';
import { parseOpenCodeOutput } from './dispatcher.js';
import { diagnoseFailure, saveDiagnosis } from './diagnosis.js';
import { snapshot as hashSnapshot, verify as hashVerify } from '../quality/hashline.js';
import { enforceTodos } from '../quality/todo-enforcer.js';
import type { TaskState, RoutingTarget } from '../types.js';
import { AUTO_PROGRESS_JSON, STATE_DISPATCH } from '../paths.js';

// ==================== Types ====================

export interface AutoRunOptions {
  agent?: 'codexfake' | 'opencode';
  timeout?: number;         // ms, 默认 600000 (10 min)
  concurrency?: number;     // 最大并行数，默认无限制
  dryRun?: boolean;
  push?: boolean;
  review?: boolean;         // L4: opencode 自审（默认 true）
}

/** 需要 Claude Code 处理的任务（auto 无法自动执行） */
export interface DeferredTask {
  taskId: string;
  taskName: string;
  reason: string;           // 'claude-code' | 'agent-teams' | 'high-complexity'
  routedTarget: string;
  complexityScore?: number;
  bundle: string;           // 预生成的 bundle，Claude Code 可直接使用
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
  review?: ReviewResult;
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
  deferred: number;
  totalTimeMs: number;
  waves: WaveResult[];
  deferredTasks: DeferredTask[];  // 需要 Claude Code 处理的任务
}

// ==================== Progress File ====================

interface AutoProgress {
  status: 'running' | 'completed' | 'failed' | 'idle';
  startedAt: string;
  updatedAt: string;
  currentWave: number;
  completed: number;
  failed: number;
  skipped: number;
  deferred: number;
  remaining: number;
  currentTasks: { taskId: string; agent: string; status: string; startedAt: string }[];
  recentLog: string[];  // 最近 20 条日志
  /** I5: ETA — 基于已完成任务平均耗时估算 */
  avgTaskDurationSec: number;
  etaSeconds: number;
  eta: string;
}

let _progressState: AutoProgress | null = null;
let _projectDir = '';

function progressPath(projectDir: string): string {
  return path.join(projectDir, AUTO_PROGRESS_JSON);
}

function initProgress(projectDir: string, remaining: number): void {
  _projectDir = projectDir;
  const dir = path.join(projectDir, STATE_DISPATCH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _progressState = {
    status: 'running',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentWave: 0,
    completed: 0, failed: 0, skipped: 0, deferred: 0,
    remaining,
    currentTasks: [],
    recentLog: [],
    avgTaskDurationSec: 0, etaSeconds: 0, eta: 'calculating...',
  };
  flushProgress();
}

function updateProgress(patch: Partial<AutoProgress>): void {
  if (!_progressState) return;
  Object.assign(_progressState, patch, { updatedAt: new Date().toISOString() });
  flushProgress();
}

function flushProgress(): void {
  if (!_progressState || !_projectDir) return;
  try {
    fs.writeFileSync(progressPath(_projectDir), JSON.stringify(_progressState, null, 2), 'utf-8');
  } catch { /* best effort */ }
}

/** 读取进度文件（供 auto-status 命令使用） */
export function readProgress(projectDir: string): AutoProgress | null {
  const p = progressPath(projectDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { return null; }
}

// ==================== Helpers ====================

function log(msg: string): void {
  const time = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[auto ${time}] ${msg}\n`);
  // 同步写入进度文件的 recentLog
  if (_progressState) {
    _progressState.recentLog.push(`[${time}] ${msg}`);
    if (_progressState.recentLog.length > 20) _progressState.recentLog.shift();
    flushProgress();
  }
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

/** 跳过 DAG 任务 (P0-#3: 自动 skip 重复失败任务) */
function dagSkip(projectDir: string, taskId: string): void {
  try {
    execSync(
      `node "${path.join(__dirname, '..', 'index.js')}" dag skip ${taskId}`,
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

/** 解析 codex 路由目标使用的 GPT 模型标识 */
function resolveGptModelForAuto(projectDir: string): string {
  try {
    const config = loadConfig(projectDir).routing;
    const provider = config.opencodeGptProviders?.[0] || 'github-copilot';
    const model = config.opencodeGptModel || 'gpt-5.3-codex';
    return `${provider}/${model}`;
  } catch {
    return 'github-copilot/gpt-5.3-codex';
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

/** 检查任务是否需要 defer 给 Claude Code（只有真正需要 Opus 能力的才 defer） */
function shouldDefer(projectDir: string, task: TaskState, options: AutoRunOptions): DeferredTask | null {
  if (options.agent) return null;

  const target = task.routing?.target || 'codexfake';
  const complexity = task.scores?.complexityScore ?? 50;

  // 只有路由到 claude-code/agent-teams 的才 defer
  if (target === 'claude-code' || target === 'agent-teams') {
    const minimal = buildMinimalContext(projectDir, task, target);
    return {
      taskId: task.id,
      taskName: task.name,
      reason: target,
      routedTarget: target,
      complexityScore: complexity,
      bundle: minimal.instruction,
    };
  }
  return null;
}

/** 执行单个任务（含 fallback） */
async function executeTask(
  projectDir: string,
  task: TaskState,
  options: AutoRunOptions
): Promise<TaskExecResult> {
  const timeout = options.timeout || 600000;

  // 确定 agent
  const routedTarget: RoutingTarget = options.agent || task.routing?.target || 'codexfake';
  const fallbackChain = routedTarget === 'codexfake'
    ? ['codexfake', 'opencode']
    : ['opencode', 'codexfake'];

  // T5: L4 FAIL 重试标记（限 1 次）
  let hasRetried = false;

  for (let attempt = 0; attempt < fallbackChain.length; attempt++) {
    const agentName = options.agent
      ? options.agent  // 强制指定时不 fallback
      : (attempt === 0
        ? (getAvailableAgent(projectDir, fallbackChain[0], fallbackChain.slice(1)) || fallbackChain[0])
        : fallbackChain[attempt]);

    // 生成 bundle
    const target = agentName as RoutingTarget;
    const minimal = buildMinimalContext(projectDir, task, target);
    const bundlePath = writeBundleFile(task.id, minimal.instruction);

    log(`${task.id} → ${agentName} ... spawned`);
    const startTime = Date.now();

    // v4.1 L0.5: Hashline — capture pre-exec state to detect collateral damage
    const preSnapshot = hashSnapshot(projectDir, task.files || []);

    // B3: 实时更新 currentTasks — spawn 后立即标记 agent 和 status
    if (_progressState) {
      const ct = _progressState.currentTasks.find(t => t.taskId === task.id);
      if (ct) { ct.agent = agentName; ct.status = 'running'; ct.startedAt = new Date().toISOString(); }
      flushProgress();
    }

    let agentStdout = '';
    let isTimeout = false;

    try {
      // 构建 shell 命令 — 全部通过 opencode CLI 执行
      // codex 路由目标使用 opencode + GPT 模型，opencode 路由目标使用默认模型
      // 用 < file 重定向传 prompt（opencode 从 stdin 读取）
      const bundlePathUnix = bundlePath.replace(/\\/g, '/');
      let shellCmd: string;
      if (agentName === 'codexfake') {
        const gptModel = resolveGptModelForAuto(projectDir);
        shellCmd = `opencode run --dangerously-skip-permissions --format json --model "${gptModel}" < "${bundlePathUnix}"`;
      } else {
        shellCmd = `opencode run --dangerously-skip-permissions --format json < "${bundlePathUnix}"`;
      }
      await new Promise<void>((resolve, reject) => {
        const child = spawn(shellCmd, [], {
          cwd: projectDir,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // P0: 捕获 stdout 用于 token 统计解析
        child.stdout?.on('data', (d: Buffer) => { agentStdout += d.toString(); });
        child.stderr?.on('data', (d: Buffer) => { agentStdout += d.toString(); });

        let killed = false;
        const timer = setTimeout(() => {
          killed = true;
          isTimeout = true;
          child.kill('SIGTERM');
          reject(new Error(`timeout after ${timeout}ms`));
        }, timeout);

        child.on('close', (code) => {
          clearTimeout(timer);
          if (killed) return;
          if (code === 0) resolve();
          else reject(new Error(`exit code ${code}`));
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const durationMs = Date.now() - startTime;
      const { created, modified } = checkFiles(projectDir, task.files || []);

      // P0: 从 opencode --format json 输出中解析 token 统计
      const tokenStats = parseOpenCodeOutput(agentStdout);

      // v4.1 L0.5: Hashline — detect collateral damage before expensive L1-L4 gates
      const hashResult = hashVerify(projectDir, preSnapshot, task.files || []);
      if (!hashResult.ok) {
        log(`${task.id} ✗ L0.5 Hashline: ${hashResult.reason}`);
        log(`${task.id}   collateral: ${hashResult.collateralDamage.slice(0, 5).join(', ')}`);
        recordFailure(projectDir, agentName);
        appendAgentExec(projectDir, {
          time: new Date().toISOString(),
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'error', duration_ms: durationMs,
          filesCreated: created, filesModified: modified,
          error: `L0.5 collateral damage: ${hashResult.collateralDamage.slice(0, 3).join(', ')}`,
        });
        return {
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'error', durationMs, filesCreated: created, filesModified: modified,
          error: `L0.5 Hashline: ${hashResult.collateralDamage.length} collateral file(s)`,
          qualityPassed: false,
        };
      }

      // 质量门禁
      const quality = verifyTaskOutput(projectDir, task);

      // v4.1 L2.5: Todo 强制执行 — 声明的文件必须被实质修改
      const todoResult = enforceTodos(projectDir, task.files || []);
      if (!todoResult.ok) {
        log(`${task.id} ✗ L2.5 Todo: ${todoResult.reason}`);
        recordFailure(projectDir, agentName);
        appendAgentExec(projectDir, {
          time: new Date().toISOString(),
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'error', duration_ms: durationMs,
          filesCreated: created, filesModified: modified,
          error: `L2.5 Todo incomplete: ${todoResult.reason}`,
        });
        return {
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'error', durationMs, filesCreated: created, filesModified: modified,
          error: `L2.5 Todo: ${todoResult.missing.length} missing, ${todoResult.empty.length} empty, ${todoResult.trivial.length} trivial`,
          qualityPassed: false,
        };
      }

      if (quality.passed) {
        // L4: opencode 自审（默认启用，--no-review 可跳过）
        let review: ReviewResult | undefined;
        const doReview = options.review !== false;
        if (doReview) {
          log(`${task.id} → L4 review...`);
          review = await reviewTaskOutput(projectDir, task, { timeout: 120000 });
          if (review.verdict === 'FAIL') {
            log(`${task.id} ⚠ L4 review FAIL: ${review.reason}`);
            writeReviewFeedback(projectDir, review, task);

            // T5: L4 FAIL 触发一次修复重试（限 1 次，不递归）
            if (!hasRetried) {
              hasRetried = true;
              log(`${task.id} → L4 retry with review feedback...`);
              const retryResult = await retryWithReviewFeedback(
                projectDir, task, agentName, review.reason, options,
              );
              if (retryResult) {
                // 重试成功: 重新跑 quality gate
                const retryQuality = verifyTaskOutput(projectDir, task);
                if (retryQuality.passed) {
                  log(`${task.id} ✓ L4 retry succeeded`);
                  review = { taskId: task.id, passed: true, verdict: 'PASS', reason: 'fixed after retry', durationMs: retryResult.durationMs };
                } else {
                  log(`${task.id} ⚠ L4 retry: quality gate still failed`);
                }
              } else {
                log(`${task.id} ⚠ L4 retry failed, keeping original result`);
              }
            }
          } else if (review.verdict === 'ERROR') {
            log(`${task.id} ⚠ L4 review error: ${review.reason}`);
          } else {
            log(`${task.id} ✓ L4 review PASS (${Math.round(review.durationMs / 1000)}s)`);
          }
        }

        recordSuccess(projectDir, agentName);
        dagComplete(projectDir, task.id);
        appendAgentExec(projectDir, {
          time: new Date().toISOString(),
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'ok', duration_ms: durationMs,
          filesCreated: created, filesModified: modified,
          tokensIn: tokenStats.tokensIn || undefined,
          tokensOut: tokenStats.tokensOut || undefined,
        });

        const tokenInfo = tokenStats.totalTokens > 0 ? `, ${tokenStats.totalTokens} tokens` : '';
        log(`${task.id} ✓ ${Math.round(durationMs / 1000)}s (${agentName}, ${created} files created${tokenInfo})`);
        if (_progressState) {
          _progressState.completed++;
          _progressState.remaining = Math.max(0, _progressState.remaining - 1);
          _progressState.currentTasks = _progressState.currentTasks.filter(t => t.taskId !== task.id);
          flushProgress();
        }
        return {
          taskId: task.id, taskName: task.name, agent: agentName,
          result: 'ok', durationMs, filesCreated: created, filesModified: modified,
          fallbackUsed: attempt > 0, qualityPassed: true, review,
        };
      }

      // 质量不通过
      log(`${task.id} ⚠ quality gate failed (${agentName}), ${quality.checks.filter(c => !c.passed).map(c => c.message).join(', ')}`);
      recordFailure(projectDir, agentName);

    } catch (e: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = e instanceof Error ? e.message.slice(0, 200) : 'unknown error';

      // P1: 区分 timeout vs error — 超时时检查文件是否已创建
      if (isTimeout) {
        const { created } = checkFiles(projectDir, task.files || []);
        if (created > 0) {
          // 文件已创建但进程超时 — 可能任务完成了但 agent 进程没退出
          log(`${task.id} ⚠ timeout but ${created} files created — treating as success`);
          const quality = verifyTaskOutput(projectDir, task);
          if (quality.passed) {
            recordSuccess(projectDir, agentName);
            dagComplete(projectDir, task.id);
            appendAgentExec(projectDir, {
              time: new Date().toISOString(),
              taskId: task.id, taskName: task.name, agent: agentName,
              result: 'ok', duration_ms: durationMs,
              filesCreated: created, filesModified: 0,
              tokensIn: parseOpenCodeOutput(agentStdout).tokensIn || undefined,
              tokensOut: parseOpenCodeOutput(agentStdout).tokensOut || undefined,
            });
            if (_progressState) {
              _progressState.completed++;
              _progressState.remaining = Math.max(0, _progressState.remaining - 1);
              _progressState.currentTasks = _progressState.currentTasks.filter(t => t.taskId !== task.id);
              flushProgress();
            }
            return {
              taskId: task.id, taskName: task.name, agent: agentName,
              result: 'ok', durationMs, filesCreated: created, filesModified: 0,
              fallbackUsed: attempt > 0, qualityPassed: true,
            };
          }
        }
        log(`${task.id} ✗ ${agentName} timeout (${Math.round(durationMs / 1000)}s), no valid output`);
      } else {
        log(`${task.id} ✗ ${agentName} error (${Math.round(durationMs / 1000)}s): ${errMsg}`);
      }

      recordFailure(projectDir, agentName);
      appendAgentExec(projectDir, {
        time: new Date().toISOString(),
        taskId: task.id, taskName: task.name, agent: agentName,
        result: 'error', duration_ms: durationMs, error: isTimeout ? `timeout: ${errMsg}` : errMsg,
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
  initProgress(projectDir, status.remaining);

  const allDeferredTasks: DeferredTask[] = [];

  if (status.remaining === 0) {
    log('All tasks already done!');
    return { totalTasks: 0, completed: 0, failed: 0, skipped: 0, deferred: 0, totalTimeMs: 0, waves: [], deferredTasks: [] };
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
    return { totalTasks: status.remaining, completed: 0, failed: 0, skipped: 0, deferred: 0, totalTimeMs: 0, waves: [], deferredTasks: [] };
  }

  // 主循环（max 20 waves 防止无限循环）
  const MAX_WAVES = 20;
  let consecutiveSkipWaves = 0;
  let waveNum = 0;
  // P0-#3: 追踪每个任务的连续失败次数和最后错误，重复失败 2 次自动 skip
  const taskFailHistory = new Map<string, { count: number; lastError: string }>();

  while (waveNum < MAX_WAVES) {
    let wave = getNextWave(projectDir);
    if (wave.length === 0) break;

    // P0-#3: 过滤掉已连续失败 2 次且错误相同的任务 → 自动 skip
    const autoSkipped: string[] = [];
    wave = wave.filter(w => {
      const hist = taskFailHistory.get(w.id);
      if (hist && hist.count >= 2) {
        autoSkipped.push(w.id);
        return false;
      }
      return true;
    });
    if (autoSkipped.length > 0) {
      for (const id of autoSkipped) {
        const hist = taskFailHistory.get(id)!;
        dagSkip(projectDir, id);
        // T4: 结构化诊断 — 任务 skip 前记录为什么失败
        const task = readTask(projectDir, id);
        if (task) {
          const diagnosis = diagnoseFailure(task, hist.count, hist.lastError);
          saveDiagnosis(projectDir, diagnosis);
          log(`${id} → auto-skipped (${hist.count}x, diagnosis: ${diagnosis.category}) ${diagnosis.suggestedAction.slice(0, 60)}`);
        } else {
          log(`${id} → auto-skipped (failed ${hist.count}x: ${hist.lastError.slice(0, 80)})`);
        }
        totalSkipped++;
      }
    }
    if (wave.length === 0) break;

    waveNum++;
    updateProgress({ currentWave: waveNum, currentTasks: wave.map(w => ({ taskId: w.id, agent: 'pending', status: 'queued', startedAt: '' })) });
    log(`\n=== Wave ${waveNum}: ${wave.length} tasks [${wave.map(t => t.id).join(', ')}] ===`);

    // Wave 级别 agent-teams 判断:
    // 只有当任务路由 target 是 claude-code 且 wave ≥ 3 时才考虑 agent-teams
    // 如果任务已路由到 codex/opencode，不拦截，让 auto 直接执行
    if (!options.agent && wave.length >= 3) {
      const waveTasks = wave.map(w => readTask(projectDir, w.id)).filter((t): t is TaskState => t !== null);
      const allClaudeCode = waveTasks.every(t => (t.routing?.target || 'codexfake') === 'claude-code');
      const allHighIsolation = waveTasks.every(t => (t.scores?.isolationScore ?? 0) >= 70);
      if (allClaudeCode && allHighIsolation) {
        for (const task of waveTasks) {
          const minimal = buildMinimalContext(projectDir, task, 'agent-teams');
          allDeferredTasks.push({
            taskId: task.id,
            taskName: task.name,
            reason: 'agent-teams',
            routedTarget: 'agent-teams',
            complexityScore: task.scores?.complexityScore ?? 50,
            bundle: minimal.instruction,
          });
        }
        log(`Wave ${waveNum}: ${wave.length} tasks → agent-teams (all claude-code + isolation ≥ 70)`);
        waves.push({ wave: waveNum, tasks: [] });
        break; // deferred 任务需要 Claude Code 处理，退出循环
      }
    }

    // 分流: 可自动执行的 vs 需要 defer 给 Claude Code 的
    const autoTasks: { id: string; name: string }[] = [];
    for (const w of wave) {
      const task = readTask(projectDir, w.id);
      if (!task) continue;
      const deferred = shouldDefer(projectDir, task, options);
      if (deferred) {
        allDeferredTasks.push(deferred);
        log(`${w.id} → deferred to ${deferred.routedTarget} (complexity: ${deferred.complexityScore})`);
      } else {
        autoTasks.push(w);
      }
    }

    if (autoTasks.length === 0) {
      log(`Wave ${waveNum}: all ${wave.length} tasks deferred`);
      waves.push({ wave: waveNum, tasks: [] });
      if (allDeferredTasks.length > 0) break; // 剩余任务需要 Claude Code
      continue;
    }

    // 并行执行可自动化的任务
    const concurrency = options.concurrency || autoTasks.length;
    const results: TaskExecResult[] = [];

    for (let i = 0; i < autoTasks.length; i += concurrency) {
      const batch = autoTasks.slice(i, i + concurrency);
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

    // P0-#3: 记录 skip 任务到 failHistory（下一波检测重复失败）
    for (const r of results.filter(r => r.result === 'skip')) {
      const hist = taskFailHistory.get(r.taskId) || { count: 0, lastError: '' };
      const errMsg = r.error || 'all agents failed';
      hist.count++;
      hist.lastError = errMsg;
      taskFailHistory.set(r.taskId, hist);
    }

    // I5: 计算 ETA — 用各任务实际耗时平均值（非墙钟时间，避免并行偏低）
    const allOkResults = waves.flatMap(w => w.tasks).filter(t => t.result === 'ok');
    const totalTaskMs = allOkResults.reduce((sum, t) => sum + t.durationMs, 0);
    const avgMs = allOkResults.length > 0 ? totalTaskMs / allOkResults.length : 0;
    const remainingCount = Math.max(0, status.remaining - totalCompleted - totalFailed - totalSkipped - allDeferredTasks.length);
    const etaSec = allOkResults.length > 0 ? Math.round(remainingCount * avgMs / 1000) : 0;
    const etaStr = etaSec > 0
      ? (etaSec >= 60 ? `~${Math.round(etaSec / 60)} min remaining` : `~${etaSec}s remaining`)
      : (remainingCount === 0 ? 'done' : 'calculating...');

    updateProgress({
      completed: totalCompleted, failed: totalFailed, skipped: totalSkipped,
      deferred: allDeferredTasks.length,
      remaining: remainingCount,
      currentTasks: [],
      avgTaskDurationSec: Math.round(avgMs / 1000),
      etaSeconds: etaSec,
      eta: etaStr,
    });

    // L3: 项目级 tsc 检查（警告模式 — 不阻塞 commit）
    // 原因：项目可能在 wave 执行前就有已知 tsc 错误，不应因此阻塞所有 wave。
    // 如需严格模式，使用 --tsc-strict 选项（未来版本）。
    const tscResult = verifyProjectTsc(projectDir);
    if (!tscResult.passed) {
      log(`⚠ L3 tsc warning (${tscResult.errors.length} errors): ${tscResult.errors.slice(0, 3).join(' | ')}`);
    }

    // Git commit
    const commitHash = commitWave(projectDir, waveNum, results);
    if (commitHash) {
      log(`Git: committed ${commitHash}`);
    }

    log(`Wave ${waveNum}: ${ok}/${results.length} ok${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''}`);

    waves.push({ wave: waveNum, tasks: results, commitHash: commitHash || undefined });

    // I4: 波次有失败时等待 30s 再继续（让 agent cooldown 恢复）
    if (failed > 0 || skipped > 0) {
      const waitSec = 30;
      log(`Wave had failures — waiting ${waitSec}s before next wave...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }

    // 全部 skip → 连续 skip 计数，达到 2 次退出（agent 不可用）
    if (ok === 0 && results.length > 0) {
      consecutiveSkipWaves++;
      if (consecutiveSkipWaves >= 2) {
        log('All agents unavailable for 2 consecutive waves. Stopping.');
        break;
      }
    } else {
      consecutiveSkipWaves = 0;
    }
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

  updateProgress({ status: totalFailed > 0 ? 'failed' : 'completed', remaining: 0, currentTasks: [] });
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

  // 输出 deferred 任务提示
  if (allDeferredTasks.length > 0) {
    log(`\n=== Deferred to Claude Code: ${allDeferredTasks.length} tasks ===`);
    for (const d of allDeferredTasks) {
      log(`${d.taskId} (${d.taskName}) → ${d.routedTarget}, complexity: ${d.complexityScore}`);
    }
    log('Use Agent Teams or direct implementation in Claude Code session.');
  }

  return { totalTasks, completed: totalCompleted, failed: totalFailed, skipped: totalSkipped, deferred: allDeferredTasks.length, totalTimeMs, waves, deferredTasks: allDeferredTasks };
}

// ─── T5: L4 FAIL 修复重试 ───────────────────────────────────────────

/**
 * L4 review FAIL 后，将 review feedback 注入上下文重新执行一次。
 * Skill-First: 闭环机制 — review 发现问题 → 注入 context → agent 修复。
 * 限制: 仅 1 次重试，用同一 agent，超时 5 分钟。
 */
async function retryWithReviewFeedback(
  projectDir: string,
  task: TaskState,
  agentName: string,
  reviewFeedback: string,
  options: AutoRunOptions,
): Promise<{ durationMs: number } | null> {
  const target = agentName as RoutingTarget;
  const minimal = buildMinimalContext(projectDir, task, target);

  // 在原始 bundle 后追加 review feedback
  const retryInstruction = `${minimal.instruction}

## ⚠ L4 Review 发现以下问题，请修复：
${reviewFeedback}

请根据上述反馈修复代码。只修改有问题的部分，不要重写整个文件。`;

  const bundlePath = writeBundleFile(`${task.id}-retry`, retryInstruction);
  const bundlePathUnix = bundlePath.replace(/\\/g, '/');
  const retryTimeout = Math.min(options.timeout || 600000, 300000); // 最多 5 分钟

  let shellCmd: string;
  if (agentName === 'codexfake') {
    const gptModel = resolveGptModelForAuto(projectDir);
    shellCmd = `opencode run --dangerously-skip-permissions --format json --model "${gptModel}" < "${bundlePathUnix}"`;
  } else {
    shellCmd = `opencode run --dangerously-skip-permissions --format json < "${bundlePathUnix}"`;
  }

  const startTime = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(shellCmd, [], {
        cwd: projectDir,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`retry timeout after ${retryTimeout}ms`));
      }, retryTimeout);
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`retry exit code ${code}`));
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    return { durationMs: Date.now() - startTime };
  } catch {
    return null;
  }
}
