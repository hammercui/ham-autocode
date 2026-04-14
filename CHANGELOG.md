# Changelog

All notable changes to ham-autocode will be documented in this file.

## [3.5.0] - 2026-04-14

### Added — Memory Progressive Disclosure (claude-mem inspired)

- **Progressive disclosure**: `getBrainContext()` now returns compact index (~150 tokens vs ~400), agents use `learn detail <topic>` for full details
- **`getBrainDetail()`**: Layer 2 retrieval — `pain`, `pattern`, `domain`, `history`, `all` topics
- **CLI**: `learn detail <topic>` command for on-demand memory access
- **PostToolUse observation capture**: hook records Write/Edit file paths to `observations.jsonl` (shell-only, zero Node overhead)
- **File co-occurrence analysis**: `auto-learn` consumes observations, identifies files frequently edited together → `brain.architecture.connections`
- **Enhanced task summaries**: `generateInsight()` produces `[date] type: name (files, outcome)` format — directly agent-readable

### Changed

- **context-template**: `buildClaudeCodeContext()` uses compact brain index (~150 tokens) instead of full painPoints/patterns embed (~400 tokens). ~60% brain section token reduction
- **evolutionLog**: capped at 30 entries (was 50), each entry now more informative with date/type/scope

## [3.4.0] - 2026-04-14

### Fixed — Memory System ROI (token收支比 3/10 → 7/10)

- **F1: context-template wired**: `buildMinimalContext()` now used by execute prepare — subagent token -60~80% (was dead code)
- **F2: Guard auto-inject**: Memory guard warnings now written into task spec, auto-included in next execute prepare
- **F3: Trimmed low-ROI modules**: field-test 259→101 lines (-61%), patterns 196→93 lines (-53%). Removed: cross-project aggregation, fileStructure/reliableGates/riskyFiles (duplicated Brain/analyzer)
- **F4: Brain reads code**: evolveFromTask reads file JSDoc headers (first 30 lines) for real module descriptions, replaces heuristic guesses
- **F5: Memory decay**: painPoints and provenPatterns auto-expire after 30 tasks of age. evolutionLog capped at 50 (was 100). domain terms capped at 30.
- **F6: Entities incremental**: auto-learn indexes only task.files (not full project scan). Full scan only via `learn entities` CLI.
- **F7: Patterns auto-consume**: getPatternHints injected into context-template for claude-code tasks

### Added

- `core/learning/code-entities.ts`: `incrementalIndexFiles()` for per-task entity updates
- `CLAUDE.md`: LSP-First token conservation rules (hover/documentSymbol/findReferences over Read)

### Removed from auto-learn cycle

- `buildDependencyGraph()` — now CLI-only (`learn deps`)
- `indexProjectEntities()` full scan — replaced by incremental

## [3.3.0] - 2026-04-14

### Changed — Token Optimization (40-60% reduction)

- **T1: Split index.ts**: 756 lines → 85-line dispatcher + 8 command modules in `core/commands/`. Agent only reads the command file it needs (~50-80 lines vs full 756).
- **T2: Slim skills**: All 10 skills compressed. auto 213→79 (-63%), detect 133→62 (-53%), parallel 127→62 (-51%), setup 113→36 (-68%), ship 100→57 (-43%), resume 100→55 (-45%). Total 980→679 lines.
- **T3: PostToolUse fast exit**: Shell-level budget check (grep JSON file) — 99% of calls exit without starting Node.
- **T4: Subagent context templates**: `core/executor/context-template.ts` — per-target minimal context (opencode ~1K, codex ~2K, claude-code ~3-5K tokens instead of 10-20K).
- **T5: SessionStart single call**: `session context` CLI — 3 Node calls → 1, compact one-line output.
- **T6: Split types.ts**: 299 lines → 4 domain files (`types/pipeline.ts`, `types/task.ts`, `types/config.ts`, `types/engine.ts`) + barrel re-export for backward compatibility.

## [3.2.0] - 2026-04-14

### Added — Field-Tested Improvements (ham-video driven)

- **Project Health Check**: `core/health/checker.ts` — automated 5-check health assessment (git/compile/test/deps/lint) with composite score 0-100 and letter grade (A-F)
- **Multi-tsconfig Support**: health check detects and validates all `tsconfig*.json` files independently (F3: Electron ESM+CJS projects)
- **Document-Code Drift Detection**: `core/health/drift-detector.ts` — scans TODO/backlog docs and cross-references git history to find status mismatches
- **Uncommitted Code Analyzer**: `core/health/uncommitted-analyzer.ts` — generates change summaries, risk assessments, and commit split suggestions for uncommitted changes
- **ESM/CJS Compatibility Detector**: `core/health/esm-cjs-detector.ts` — finds `import.meta` in CJS, `__dirname` in ESM, `require()` in ESM, and other dual-module conflicts
- **Field Test Feedback Loop**: `core/learning/field-test.ts` — records framework-level findings from real project usage, auto-aggregates cross-project patterns into improvement priorities
- **Health Check Skill**: `skills/health-check/SKILL.md` — orchestrates health assessment in agent workflow
- **CLI**: `health check`, `health quick`, `health drift`, `health uncommitted`, `health esm-cjs`, `learn field-test`, `learn field-test record`, `learn field-test resolve`

### Changed

- **Auto-learn**: integrates field-test auto-detection — recurring failures and slow tasks automatically recorded as framework findings
- **Windows compatibility**: health check uses `shell: true` and `.cmd` suffix for npm/npx on Windows

## [3.1.0] - 2026-04-13

### Added — Token Saving + Memory + PM Methods + OpenCode + Research

- **File Summary Cache**: `core/context/summary-cache.ts` — extract function/class/interface signatures, cache by content hash
- **Incremental Context**: `core/context/incremental.ts` — MD5 snapshot-based change detection, skip unchanged files
- **TF-IDF Search**: `core/context/tfidf.ts` — zero-dependency semantic file search
- **Code Entity Extraction**: `core/learning/code-entities.ts` — regex-based function/class/interface/type/enum extraction
- **Dependency Graph**: `core/learning/dependency-graph.ts` — import-based file dependency graph with impact analysis (BFS)
- **Memory Guard**: `core/learning/memory-guard.ts` — post-task quality check for duplicates, TODO/FIXME, long files, console.log
- **Critical Path Analysis (CPM)**: `core/dag/critical-path.ts` — forward/backward pass, slack calculation, bottleneck detection
- **PERT Estimation**: `core/dag/estimation.ts` — three-point estimation with history-based correction
- **Earned Value Management (EVM)**: `core/dag/earned-value.ts` — PV/EV/AC/SPI/CPI/EAC/VAC metrics
- **ASCII Gantt Chart**: `core/dag/gantt.ts` — critical path highlighted with special characters
- **OpenCode Agent**: `core/executor/opencode.ts` + `agents/opencode.md` — 5th routing target using GLM-5.1 for simple tasks
- **Competitive Research**: `core/research/competitor.ts` + `skills/research/SKILL.md` — competitor analysis engine
- **13 new CLI commands**: context summary/search, learn entities/deps/impact/guard, dag critical-path/estimate/evm/gantt, research init/report/status

### Changed

- **Router**: Rule 0 — complexityScore<=20 && files<=3 routes to opencode (with codex exclusion)
- **RoutingTarget**: expanded to 5 targets (added opencode)

## [3.0.0] - 2026-04-13

### Added — CE Knowledge Compounding (the last 1%)
- **Learning Analyzer**: `core/learning/analyzer.ts` — analyze trace + task history, generate insights (routing accuracy, failure patterns, token costs, threshold suggestions)
- **Learning Adapter**: `core/learning/adapter.ts` — suggest and apply threshold adaptations to harness.json, with history tracking
- **Pattern Memory**: `core/learning/patterns.ts` — cross-session project patterns (file structure, task types, gate reliability, risky files)
- **CLI**: `learn analyze`, `learn suggest`, `learn apply`, `learn patterns`, `learn history`, `learn reset`, `learn hints`
- Insights persisted to `.ham-autocode/learning/insights.json`
- Patterns persisted to `.ham-autocode/learning/patterns.json`
- History tracked in `.ham-autocode/learning/history.jsonl`

### Changed — Intelligence Integration
- **Router**: reads learning insights before routing — adapted thresholds override config defaults
- **Recovery**: `autoSelectStrategy` checks failure patterns — auto-upgrades to worktree if similar tasks failed before
- Harness coverage: 99% → 100%

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
