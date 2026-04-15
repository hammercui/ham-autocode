/** Harness configuration types */

import type { RoutingTarget, RecoveryStrategy } from './task.js';

export interface HarnessConfig {
  schemaVersion: number;
  context: ContextConfig;
  validation: ValidationConfig;
  routing: RoutingConfig;
  recovery: RecoveryConfig;
}

export interface ContextConfig {
  advisoryThreshold: number;
  compressThreshold: number;
  criticalThreshold: number;
}

export interface ValidationConfig {
  mode: 'strict' | 'permissive';
  maxAttempts: number;
  gates: string[];
  onFinalFail: 'block' | 'warn';
}

export interface RoutingConfig {
  confirmThreshold: number;
  codexMinSpecScore: number;
  codexMinIsolationScore: number;
  defaultTarget: RoutingTarget;
  /** opencode 模型配置 — codex 路由目标实际通过 opencode CLI + 此模型执行 */
  opencodeGptModel: string;
  /** 模型供应商列表，按优先级排序。可选: 'github-copilot', 'openai' */
  opencodeGptProviders: string[];
}

export interface RecoveryConfig {
  lowRiskStrategy: RecoveryStrategy;
  highRiskThreshold: number;
  highRiskStrategy: RecoveryStrategy;
}
