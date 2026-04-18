/**
 * Auto Runner — 全自动循环执行 DAG 剩余任务。
 *
 * v4.2 拆分: 980 行神文件 → 6 个职责单一的 runner/* 模块。
 * 本文件仅作为向后兼容门面，不承载逻辑。
 *
 * 架构:
 *   runner/types.ts       — 类型
 *   runner/progress.ts    — RunContext + log + progress 写入
 *   runner/helpers.ts     — dag CLI 封装 + model 解析 + output 解析
 *   runner/wave-commit.ts — git commit 波次
 *   runner/task-exec.ts   — 单任务执行 (fallback + L0.5/L2/L2.5/L4 门禁)
 *   runner/run-auto.ts    — 主编排循环
 */

export { runAuto } from './runner/run-auto.js';
export { readProgress } from './runner/progress.js';
export type {
  AutoRunOptions,
  AutoRunResult,
  DeferredTask,
  TaskExecResult,
  WaveResult,
  AutoProgress,
  RunContext,
} from './runner/types.js';
