# Changelog

All notable changes to ham-autocode will be documented in this file.

## [2.3.0] - 2026-04-13

### Added — Spec Engine (OpenSpec Integration)
- **Spec Reader**: `core/spec/reader.ts` — detect and read OpenSpec directory structure (specs + changes)
- **Spec Enricher**: `core/spec/enricher.ts` — enrich tasks with OpenSpec artifacts or heuristic fallback
- **Spec Sync**: `core/spec/sync.ts` — merge delta specs to source of truth after task completion
- **CLI**: `spec detect`, `spec enrich <id>`, `spec enrich-all`, `spec score <id>`, `spec sync <id>`

### Changed
- **specScore calculation**: now based on 4 dimensions (description, interface, acceptance, completeness) instead of single completeness field
- **Parser**: supports markdown table format with dependency columns (5-column WBS tables)
- **Parser**: extracts table dependencies ("2.2.3, 1.3" → blockedBy resolution)

### Fixed
- Parser table format support for real-world WBS files (ham-video: 33 tasks parsed, was 0)
- Parser dependency column extraction enables proper DAG blocking

## [2.2.0] - 2026-04-13

### Added — Observability
- **Structured trace**: upgraded trace.jsonl with taskId/phase fields
- **Trace query**: `trace query [--task <id>] [--result ok|error] [--limit N]`
- **DAG visualization**: `dag visualize` — ASCII DAG with status icons (✓✗○⊘■) and dependency tree
- **Session report**: `session report` — project summary with task stats, command count, token consumption

### Added — Auto-commit
- **Validate-then-commit**: `commit auto <task-id>` — git add + commit task files (opt-in via `autoCommit: true`)
- **Commit rollback**: `commit rollback` — git reset HEAD~1 to undo last auto-commit
- **Commit preview**: `commit message <task-id>` — preview `feat(task-id): name` format

### Added — Agent Teams
- **4th routing target**: `agent-teams` added to RoutingTarget enum
- **Teammate assignment**: `teams assign` — groups tasks by file ownership, merges conflicts
- **Wave-level routing**: `teams should-use` — checks if wave qualifies for parallel execution
- **Progressive batching**: initial 2 teammates, expand to 4-5 on success

### Added — Guardrail Rules
- **Rule engine**: `core/rules/engine.ts` — declarative registerRule/checkRules/checkRulesSummary
- **8 core rules** (R01-R08): file-line-limit, commit-file-limit, test-coverage-guard, no-todo-in-done, import-path-exists, sensitive-file-guard, context-budget-guard, failure-rate-guard
- **CLI**: `rules list`, `rules check [task-id]`

### Added — Schema Validation
- **Runtime validator**: `core/state/validator.ts` — zero-dep pipeline.json and task-*.json validation
- **Integrated into reads**: readPipeline() and readTask() now throw on corrupt files

### Changed
- RoutingTarget expanded from 3 to 4 targets (added agent-teams)
- git.ts: added add(), commit(), resetLast() methods
- TraceEntry: added optional taskId and phase fields

## [2.1.0] - 2026-04-13

### Added — TypeScript Migration
- Migrated entire core engine (25 modules) from JavaScript to TypeScript
- `core/types.ts`: 30+ shared type definitions (TaskState, PipelineState, HarnessConfig, etc.)
- tsconfig.json: strict mode, ES2022, Node16 module resolution
- Build output to dist/ (CLI path: dist/index.js)

### Added — Gap Fixes (83% → 92% Harness coverage)
- A1: `execute prepare <task-id>` — executor adapter CLI
- A2: topoSort integrated into scheduler for cycle detection
- A3: DAG dependency inference from file overlap
- A4: `context budget consume <amount>` — token budget CLI
- A5: pipeline.current_task auto-cleared on dag complete/fail
- A6: blocked status auto-inferred in dag status
- A7: autoSelectStrategy() by complexityScore
- B1: Execution trace logging (trace.jsonl with 1MB rotation)
- B2: file-index.json persistence
- B4: Auto-rollback on two-strike validation block

### Fixed
- Parser regex: support ##/###/#### headers + checkbox format
- Pipeline log: auto-append on dag init/complete/fail/skip
- npm test: created run-all.js test runner
- Graceful rollback: skip missing files instead of failing

## [2.0.0] - 2026-04-11

### Added — Core Engine (Node.js, zero dependencies)
- **DAG Scheduler**: topological sort, wave-based parallel execution, cycle detection
- **Context Engine**: token budget tracking, selective file loading, three-level protection (advisory/compress/critical)
- **Agent Router**: three-dimension scoring (spec/complexity/isolation), routing to Claude Code/Codex/Claude App
- **Executor Adapters**: structured instruction generation for claude-code, codex, claude-app
- **Validation Gates**: auto-detect lint/typecheck/test commands, two-strike-out policy
- **Recovery Engine**: git tag checkpoint + git worktree isolation, two-level strategy
- **Atomic State Management**: file-lock mutex, atomic JSON write, schema migration
- **CLI Dispatcher**: `node core/index.js <command>` with 30+ subcommands covering all engine modules
- **Pipeline state**: `pipeline mark-interrupted` command for clean session-end handling

### Added — Skills & Hooks
- 7 skills: detect, auto, parallel, ship, status, pause, resume
- 5 subagent definitions: planner, coder, reviewer, qa-tester, infra
- 3 hooks: SessionStart (inject pipeline state), SessionEnd (mark interrupted), PostToolUse (context budget)
- JSON Schemas: pipeline, task, harness config

### Changed
- All skills now use core engine CLI (`node core/index.js`) instead of inline logic
- ARCHITECTURE.md rewritten for v2.0 (core engine, CLI commands, updated directory structure)
- QUICKSTART.md updated to reflect 7 skills
- task.schema.json status enum aligned with v2 design (added in_progress, validating, blocked)

### Fixed
- Skills CLI commands aligned with actual core/index.js interface (15+ command name corrections)
- SessionEnd hook uses CLI instead of direct module require
- PostToolUse hook Windows compatibility (replaced /dev/stdin with stream reader)
- lock.js ENOENT crash when stateDir missing (auto-create)
- recover CLI shows proper usage when subcommand missing
- Removed duplicate pipeline schema file
- 25 Codex review issues fixed across 3 rounds (S1-S4, C1-C7, V1-V5, Q1-Q6, CC1-CC3)

### Security
- S1: execFileSync with argument arrays (no shell injection)
- S2: taskId regex validation + path.resolve traversal guard
- S3: requiredFiles constrained to project root
- S4: validation command trust boundary documented

## [1.1.0] - 2026-04-11

### Added
- Plugin structure: `.claude-plugin/plugin.json` manifest
- 7 skills: detect, auto, parallel, ship, status, pause, resume
- 5 subagent definitions: planner (Opus), coder (Sonnet), reviewer (Opus), qa-tester (Sonnet), infra (Sonnet)
- 3 hooks: SessionStart, SessionEnd, PostToolUse
- `pipeline.json` state persistence in target projects
- `loop.md` default maintenance behavior
- `settings.json` with Agent Teams experimental flag
- JSON Schema for pipeline state

### Changed
- Upgraded from v1.0 pure skill concept to installable plugin format

## [1.0.0] - 2026-04-10

### Added
- Initial concept: pure Skill orchestration (zero custom code)
- Three-layer framework: gstack thinks → GSD stabilizes → Superpowers executes
- Three-tool workflow: Claude App (PM) + Claude Code (engineer) + Codex (capable engineer)
- Six-phase pipeline design: initiation → requirements → planning → execution → review → ship
- Task routing concept: complexity-based assignment to Claude Code vs Codex
- ARCHITECTURE.md v1.0 with framework analysis and collaboration model
