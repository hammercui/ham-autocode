/**
 * ham-autocode Core Engine — Shared Type Definitions
 * Re-exports from domain-specific type files.
 * Import from here for backward compatibility, or from specific files to save tokens.
 */

export type { PipelineState, PipelineStatus, PhaseState, LogEntry } from './types/pipeline.js';
export type { TaskState, TaskStatus, TaskSpec, TaskScores, RoutingTarget, TaskRouting, RecoveryStrategy, TaskRecovery, TaskValidation, TaskContext, TaskExecution, ErrorType, GateResult } from './types/task.js';
export type { HarnessConfig, ContextConfig, ValidationConfig, RoutingConfig, RecoveryConfig } from './types/config.js';
export type { GateAction, ValidationResult, DetectedGate, BudgetLevel, BudgetStatus, ContextPrepareResult, DAGStats, TopoSortResult, ParseResult, RoutingDecision, GitResult, CheckpointResult, WorktreeResult, ExecutionInstruction, ExecutionResult, TraceEntry, ReadJSONResult, FileIndexEntry, FileIndex } from './types/engine.js';
