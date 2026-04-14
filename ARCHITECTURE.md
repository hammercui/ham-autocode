# ham-autocode Architecture (v3.4)

> Claude Code Plugin — Harness Architecture for autonomous development.

## Layers

```
User → Skills (10) → CLI Dispatcher → Command Modules → Core Engine
                                                            │
                    ┌───────────┬──────────┬────────────────┤
                    ▼           ▼          ▼                ▼
               DAG/Scheduler  Context   Routing         Learning
               Parser/CPM     Budget    Scorer/Quota    Brain/Entities
               EVM/Gantt      Summary   Adapters(5)     Guard/Patterns
                              TF-IDF    Executor        Analyzer/Adapter
```

## Directory Map

| Path | Purpose |
|------|---------|
| `core/commands/` | CLI command handlers (8 files, dispatched by index.ts) |
| `core/dag/` | DAG scheduler, parser, CPM, PERT, EVM, Gantt |
| `core/context/` | Token budget, file summary cache, incremental, TF-IDF |
| `core/routing/` | 3-dimension scorer, 5-target router, quota fallback |
| `core/executor/` | Adapters: claude-code, codex, claude-app, agent-teams, opencode |
| `core/learning/` | Project brain, entities, patterns, analyzer, guard, field-test |
| `core/validation/` | Gate detector, two-strike validator |
| `core/recovery/` | Git checkpoint, worktree isolation |
| `core/health/` | Project health check, drift, ESM/CJS, uncommitted analyzer |
| `core/spec/` | OpenSpec reader, enricher, sync |
| `core/state/` | Atomic JSON, pipeline, task-graph, config, validator |
| `core/types/` | Domain type files (pipeline, task, config, engine) |
| `skills/` | 10 skills: auto, detect, status, pause, resume, ship, parallel, setup, health-check, research |
| `agents/` | 6 agent definitions (planner, coder, reviewer, qa-tester, infra, opencode) |
| `hooks/` | SessionStart, SessionEnd, PostToolUse |

## Routing Targets

| Target | Model | When |
|--------|-------|------|
| opencode | GLM-5.1 (free) | complexity ≤ 20, files ≤ 3 |
| codex | GPT-5 | specScore ≥ 80, isolationScore ≥ 70 |
| claude-app | Sonnet | doc/config/hotfix tasks |
| claude-code | Opus | complex/architectural (default) |
| agent-teams | Sonnet ×N | parallel wave ≥ 3 isolated tasks |

Quota fallback: codex → opencode → claude-code (auto after 2 failures, 30min recovery).

## Data Flow

```
dag complete/fail → auto-learn → brain + guard + entities (incremental) + field-test
                               → every 5 tasks: analyzer → insights → adapter (threshold suggestions)
                               → patterns (task type stats)

execute prepare → context-template → minimal context per target (1-5K tokens)
route <task>    → scorer + router + quota check → routing decision
```

## Key Design Decisions

- Zero runtime dependencies (Node.js built-ins only)
- TypeScript strict mode, Node16 module resolution
- Atomic JSON writes with file locking
- LSP-first for code understanding (CLAUDE.md rule)
- Memory decay: painPoints/provenPatterns expire after 30 tasks
