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
}

export interface RecoveryConfig {
  lowRiskStrategy: RecoveryStrategy;
  highRiskThreshold: number;
  highRiskStrategy: RecoveryStrategy;
}
