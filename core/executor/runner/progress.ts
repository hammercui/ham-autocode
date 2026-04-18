/**
 * 进度状态管理 — v4.2 拆分。
 *
 * _activeCtx 是本模块内部的单例指针，仅供 log() 隐式使用和跨模块的 mark* 操作。
 * runAuto 入口 createRunContext → set；退出 clearActiveCtx → unset。
 * task-exec 等其他模块通过 markTaskRunning / markTaskDone 语义函数操作，
 * 不直接访问 _activeCtx 变量。
 */

import fs from 'fs';
import path from 'path';
import { AUTO_PROGRESS_JSON, STATE_DISPATCH } from '../../paths.js';
import type { AutoProgress, RunContext } from './types.js';

let _activeCtx: RunContext | null = null;

function progressPath(projectDir: string): string {
  return path.join(projectDir, AUTO_PROGRESS_JSON);
}

export function createRunContext(projectDir: string, remaining: number): RunContext {
  const dir = path.join(projectDir, STATE_DISPATCH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ctx: RunContext = {
    projectDir,
    progress: {
      status: 'running',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentWave: 0,
      completed: 0, failed: 0, skipped: 0, deferred: 0,
      remaining,
      currentTasks: [],
      recentLog: [],
      avgTaskDurationSec: 0, etaSeconds: 0, eta: 'calculating...',
    },
  };
  _activeCtx = ctx;
  writeProgress(ctx);
  return ctx;
}

export function updateProgress(ctx: RunContext, patch: Partial<AutoProgress>): void {
  Object.assign(ctx.progress, patch, { updatedAt: new Date().toISOString() });
  writeProgress(ctx);
}

export function writeProgress(ctx: RunContext): void {
  try {
    fs.writeFileSync(progressPath(ctx.projectDir), JSON.stringify(ctx.progress, null, 2), 'utf-8');
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

/** runAuto 退出时调用，防止 log() 隐式访问跨 run 泄漏 */
export function clearActiveCtx(): void {
  _activeCtx = null;
}

// ─── 日志 ────────────────────────────────────────────────
// log 散布在各个模块，通过本文件的 _activeCtx 单例写入 recentLog。

export function log(msg: string): void {
  const time = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[auto ${time}] ${msg}\n`);
  if (_activeCtx) {
    _activeCtx.progress.recentLog.push(`[${time}] ${msg}`);
    if (_activeCtx.progress.recentLog.length > 20) _activeCtx.progress.recentLog.shift();
    writeProgress(_activeCtx);
  }
}

// ─── task 级语义操作 (task-exec 使用，隔离 _activeCtx 访问) ─

/** 标记某任务进入 running 状态（agent spawn 后立即调用） */
export function markTaskRunning(taskId: string, agent: string): void {
  if (!_activeCtx) return;
  const ct = _activeCtx.progress.currentTasks.find(t => t.taskId === taskId);
  if (ct) { ct.agent = agent; ct.status = 'running'; ct.startedAt = new Date().toISOString(); }
  writeProgress(_activeCtx);
}

/** 标记某任务完成（OK 路径 + timeout-success 路径共用） */
export function markTaskDone(taskId: string): void {
  if (!_activeCtx) return;
  _activeCtx.progress.completed++;
  _activeCtx.progress.remaining = Math.max(0, _activeCtx.progress.remaining - 1);
  _activeCtx.progress.currentTasks = _activeCtx.progress.currentTasks.filter(t => t.taskId !== taskId);
  writeProgress(_activeCtx);
}
