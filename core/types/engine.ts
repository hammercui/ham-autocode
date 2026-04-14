/** Engine-level types: validation, context, DAG, routing, recovery, executor, trace, state */

import type { TaskScores, RoutingTarget, GateResult, ErrorType } from './task.js';
import type { ContextConfig } from './config.js';

// ─── Validation ────────────────────────────────────────────────
export type GateAction = 'proceed' | 'retry' | 'block';

export interface ValidationResult {
  taskId: string;
  passed: boolean;
  action: GateAction;
  gates: GateResult[];
  attempts: number;
  maxAttempts: number;
  results: GateResult[];
}

export interface DetectedGate {
  name: string;
  command: string;
  source: string;
}

// ─── Context Engine ────────────────────────────────────────────
export type BudgetLevel = 'ok' | 'advisory' | 'compress' | 'critical';

export interface BudgetStatus {
  consumed: number;
  usagePercent: number;
  level: BudgetLevel;
  recommendation: string;
  thresholds: ContextConfig;
}

export interface ContextPrepareResult {
  taskId: string;
  requiredFiles: string[];
  estimatedTokens: number;
  budgetRemaining: number;
  recommendation: string;
}

// ─── DAG ───────────────────────────────────────────────────────
export interface DAGStats {
  total: number;
  byStatus: Record<string, number>;
  done: number;
  remaining: number;
  progress: number;
}

export interface TopoSortResult {
  sorted: import('./task.js').TaskState[];
  cycles: string[];
}

export interface ParseResult {
  planFile: string;
  count: number;
  tasks: import('./task.js').TaskState[];
}

// ─── Routing ───────────────────────────────────────────────────
export interface RoutingDecision {
  target: RoutingTarget;
  reason: string;
  needsConfirmation: boolean;
  scores: TaskScores;
}

// ─── Recovery ──────────────────────────────────────────────────
export interface GitResult {
  ok: boolean;
  output: string;
}

export interface CheckpointResult extends GitResult {
  ref?: string;
}

export interface WorktreeResult extends GitResult {
  path?: string;
  branch?: string;
}

// ─── Executor ──────────────────────────────────────────────────
export interface ExecutionInstruction {
  prompt: string;
  files: string[];
  constraints: string[];
}

export interface ExecutionResult {
  success: boolean;
  errorType?: ErrorType;
  changes?: string[];
}

// ─── Trace ─────────────────────────────────────────────────────
export interface TraceEntry {
  time: string;
  command: string;
  result: 'ok' | 'error';
  duration_ms: number;
  error?: string;
  taskId?: string;
  phase?: string;
}

// ─── State ─────────────────────────────────────────────────────
export interface ReadJSONResult<T> {
  data: T | null;
  error: NodeJS.ErrnoException | null;
}

export interface FileIndexEntry {
  tokens: number;
  size: number;
}

export type FileIndex = Record<string, FileIndexEntry>;
