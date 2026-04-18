/**
 * Auto Runner 类型定义 — v4.2 拆分。
 * 原 auto-runner.ts 的 Types 段整体迁移。
 */

import type { ReviewResult } from '../review-gate.js';

export interface AutoRunOptions {
  agent?: 'codexfake' | 'opencode' | 'cc-sonnet' | 'cc-haiku';
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
  /** v4.2: agent 执行消耗的总 token（input + output）。A/B log 使用。 */
  totalTokens?: number;
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

export interface AutoProgress {
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

/**
 * v4.2: RunContext — 显式封装一次 runAuto 调用的状态。
 * 消除之前的两个模块级变量，progress 变更全部走 ctx 参数。
 */
export interface RunContext {
  projectDir: string;
  progress: AutoProgress;
}
