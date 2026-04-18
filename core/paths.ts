/**
 * Centralized path constants for ham-autocode.
 *
 * v4.1 refactor: all state under .ham-autocode/state/, all docs under .ham-autocode/docs/.
 * Legacy layout (.ham-autocode/tasks/, .ham-autocode/logs/, .planning/) is handled by
 * `ham-cli migrate` — do NOT add dual-path fallback here.
 *
 * Rule: every path string in core/ must come from this file. No ad-hoc path.join with
 * literal '.ham-autocode' or '.planning' elsewhere.
 */
import path from 'path';

/** Root directory for all ham-autocode artifacts (auto-created). */
export const ROOT = '.ham-autocode';

// ==================== state/ — runtime machine-owned ====================

/** State root: tasks, logs, learning, progress. Machine reads/writes. */
export const STATE = path.join(ROOT, 'state');

export const STATE_TASKS = path.join(STATE, 'tasks');
export const STATE_LOGS = path.join(STATE, 'logs');
export const STATE_LEARNING = path.join(STATE, 'learning');
export const STATE_DISPATCH = path.join(STATE, 'dispatch');
export const STATE_CONTEXT = path.join(STATE, 'context');
export const STATE_RESEARCH = path.join(STATE, 'research');
export const STATE_WORKTREES = path.join(STATE, 'worktrees');
export const STATE_ROUTING = path.join(STATE, 'routing');
export const ROUTING_AB_LOG = path.join(STATE_ROUTING, 'ab-log.jsonl');

/** File paths under state/. */
export const PROGRESS_JSON = path.join(STATE, 'progress.json');
export const PIPELINE_JSON = path.join(STATE, 'pipeline.json');
export const HARNESS_JSON = path.join(STATE, 'harness.json');
export const TRACE_JSONL = path.join(STATE_LOGS, 'trace.jsonl');
export const AGENT_STATUS_JSON = path.join(STATE_DISPATCH, 'agent-status.json');
export const AUTO_PROGRESS_JSON = path.join(STATE_DISPATCH, 'auto-progress.json');
export const REVIEW_FEEDBACK_JSONL = path.join(STATE_LOGS, 'review-feedback.jsonl');
export const LEARNING_AUTO_STATE = path.join(STATE_LEARNING, 'auto-state.json');
export const LEARNING_OBSERVATIONS = path.join(STATE_LEARNING, 'observations.jsonl');
export const LEARNING_BRAIN = path.join(STATE_LEARNING, 'project-brain.json');
export const CONTEXT_SUMMARIES = path.join(STATE_CONTEXT, 'summaries.json');
export const CONTEXT_BUDGET = path.join(STATE_CONTEXT, 'budget.json');
export const COMPETITIVE_ANALYSIS = path.join(STATE_RESEARCH, 'competitive-analysis.json');

/** Scratch tmp files (short-lived, inside ROOT). */
export const SPEC_PROMPT_TMP = path.join(ROOT, '.spec-prompt.tmp');
export const DEFERRED_PROMPT_TMP = path.join(ROOT, '.deferred-prompt.tmp');

// ==================== docs/ — human-authored knowledge ====================

/** Docs root: requirements, design, plans, todos, quality, failures, research. */
export const DOCS = path.join(ROOT, 'docs');

export const DOCS_REQUIREMENTS = path.join(DOCS, 'requirements');
export const DOCS_DESIGN = path.join(DOCS, 'design');
export const DOCS_PLANS = path.join(DOCS, 'plans');
export const DOCS_PLANS_RETROS = path.join(DOCS_PLANS, 'retros');
export const DOCS_TODOS = path.join(DOCS, 'todos');
export const DOCS_QUALITY = path.join(DOCS, 'quality');
export const DOCS_FAILURES = path.join(DOCS, 'failures');
export const DOCS_RESEARCH = path.join(DOCS, 'research');

/** Entry index for all agents. */
export const INDEX_MD = path.join(ROOT, 'INDEX.md');

/** Canonical plan/WBS file names (live under docs/plans/). */
export const PLAN_MD = path.join(DOCS_PLANS, 'PLAN.md');
export const WBS_MD = path.join(DOCS_PLANS, 'WBS.md');

// ==================== runtime/ — scripts ====================

export const RUNTIME = path.join(ROOT, 'runtime');
export const INIT_SH = path.join(RUNTIME, 'init.sh');

// ==================== Helpers ====================

/** Resolve an absolute path within a specific project directory. */
export function abs(projectDir: string, relative: string): string {
  return path.join(projectDir, relative);
}
