/**
 * ham-autocode Core Engine — Shared Type Definitions
 * All state files, configs, and inter-module contracts are defined here.
 */

// ─── Pipeline State ────────────────────────────────────────────

export interface PipelineState {
  schemaVersion: number;
  project: string;
  status: PipelineStatus;
  started_at: string;
  updated_at: string;
  paused_at?: string | null;
  interrupted_at?: string | null;
  resumed_at?: string | null;
  current_task?: string | null;
  current_phase?: number | null;
  current_step?: string | null;
  last_completed?: string | null;
  next_action?: string | null;
  resume_instructions?: string | null;
  active_agent_teams?: string[];
  phases?: Record<string, PhaseState>;
  log: LogEntry[];
}

export type PipelineStatus = 'running' | 'paused' | 'interrupted' | 'completed';

export interface PhaseState {
  status: 'pending' | 'running' | 'done' | 'skipped';
  name: string;
  completed_at?: string | null;
}

export interface LogEntry {
  time: string;
  action: string;
}

// ─── Task State ────────────────────────────────────────────────

export interface TaskState {
  schemaVersion: number;
  id: string;
  name: string;
  milestone: string;
  phase: string;
  status: TaskStatus;
  blockedBy: string[];
  files: string[];
  spec: TaskSpec;
  scores: TaskScores;
  routing: TaskRouting;
  recovery: TaskRecovery;
  validation: TaskValidation;
  context: TaskContext;
  execution: TaskExecution;
}

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'validating'
  | 'done'
  | 'failed'
  | 'skipped';

export interface TaskSpec {
  description: string;
  interface: string;
  acceptance: string;
  completeness: number;
}

export interface TaskScores {
  specScore: number;
  complexityScore: number;
  isolationScore: number;
}

export type RoutingTarget = 'claude-code' | 'codex' | 'claude-app';

export interface TaskRouting {
  target: RoutingTarget;
  reason: string;
  needsConfirmation: boolean;
  confirmed: boolean;
}

export type RecoveryStrategy = 'checkpoint' | 'worktree';

export interface TaskRecovery {
  strategy: RecoveryStrategy;
  checkpointRef?: string | null;
  worktreePath?: string | null;
  branch?: string | null;
}

export interface TaskValidation {
  gates: GateResult[];
  attempts: number;
  maxAttempts: number;
  results: GateResult[];
}

export interface TaskContext {
  requiredFiles: string[];
  estimatedTokens: number;
}

export interface TaskExecution {
  sessionId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  errorType?: ErrorType | null;
}

// ─── Error Types ───────────────────────────────────────────────

export type ErrorType =
  | 'agent_error'
  | 'tool_error'
  | 'validation_fail'
  | 'context_exceeded'
  | 'state_error'
  | 'user_rejected'
  | 'timeout';

// ─── Harness Config ────────────────────────────────────────────

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

// ─── Validation ────────────────────────────────────────────────

export interface GateResult {
  gate: string;
  pass: boolean;
  output: string;
  command?: string;
}

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
  sorted: TaskState[];
  cycles: string[];
}

export interface ParseResult {
  planFile: string;
  count: number;
  tasks: TaskState[];
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

// ─── Executor Adapters ─────────────────────────────────────────

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
}

// ─── Atomic State ──────────────────────────────────────────────

export interface ReadJSONResult<T> {
  data: T | null;
  error: NodeJS.ErrnoException | null;
}

export interface FileIndexEntry {
  tokens: number;
  size: number;
}

export type FileIndex = Record<string, FileIndexEntry>;
