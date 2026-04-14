/** Task state and related types */

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

export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'validating' | 'done' | 'failed' | 'skipped';

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

export type RoutingTarget = 'claude-code' | 'codex' | 'claude-app' | 'agent-teams' | 'opencode';

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

export type ErrorType = 'agent_error' | 'tool_error' | 'validation_fail' | 'context_exceeded' | 'state_error' | 'user_rejected' | 'timeout';

export interface GateResult {
  gate: string;
  pass: boolean;
  output: string;
  command?: string;
}
