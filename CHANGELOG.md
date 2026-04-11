# Changelog

All notable changes to ham-autocode will be documented in this file.

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
- Initial plugin structure with 7 skills, 5 agents, hooks
- Pure skill orchestration (gstack + GSD + Superpowers)
- Six-phase pipeline: initiation, requirements, planning, execution, review, ship
- Project state detection for existing projects
- Pause/resume with pipeline.json state persistence
