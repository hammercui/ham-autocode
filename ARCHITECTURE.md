# ham-autocode Architecture (v3.9.1)

> Claude Code Plugin — Harness Architecture aligned with Four Pillars.

## Design Principle

> "If the Harness keeps getting more complex, it's probably over-engineered." — Manus team
>
> v3.9.1 deleted 1,760 lines of unused "learning" code. Simpler = better.

## Layers

```
User → Skills (10) → CLI Dispatcher → Command Modules → Core Engine
                                                            │
                    ┌───────────┬──────────┬────────────────┤
                    ▼           ▼          ▼                ▼
               DAG/Scheduler  Context   Routing         Brain
               Parser/CPM     Summary   Scorer(5-target)  Entities
               EVM/Gantt      Template  Executor(auto)    Auto-learn
               Merge/Impact             Quality Gate
                                        Review Gate
```

## Directory Map

| Path | Purpose | LoC |
|------|---------|-----|
| `core/commands/` | CLI command handlers (7 files) | ~800 |
| `core/dag/` | DAG: scheduler, parser, CPM, PERT, EVM, Gantt, merge, graph | ~900 |
| `core/context/` | File summary cache (1 file, after v3.9.1 cleanup) | ~170 |
| `core/routing/` | 5-target scorer + static router + quota (simplified) | ~250 |
| `core/executor/` | auto-runner, dispatcher, context-template, quality-gate, review-gate | ~2,100 |
| `core/learning/` | Project brain, code entities, auto-learn (3 files, after v3.9.1 cleanup) | ~760 |
| `core/recovery/` | Git checkpoint, worktree isolation | ~130 |
| `core/health/` | Health check, drift, ESM/CJS, uncommitted analyzer | ~1,400 |
| `core/spec/` | OpenSpec reader, enricher, sync | ~450 |
| `core/state/` | Atomic JSON, pipeline, task-graph, config, validator, lock | ~400 |
| `core/types/` | Domain types (pipeline, task, config, engine) | ~280 |

## Three-Layer Framework

```
gstack (strategic thinking)  →  GSD (workflow stability)  →  Superpowers (execution discipline)
  CEO/Eng/Design review           Phase-driven dev              TDD, code review
  QA, research, ship              Spec enforcement              Brainstorming, debugging
  Office hours                    Verification gates            Verification before completion
```

ham-autocode sits at the center, orchestrating all three frameworks via skills.

## DAG + Project Management

| PM Method | Module | CLI |
|-----------|--------|-----|
| WBS → DAG | `parser.ts` | `dag init [PLAN.md]` |
| Critical Path (CPM) | `critical-path.ts` | `dag critical-path` |
| PERT 3-Point Estimation | `estimation.ts` | `dag estimate` |
| Earned Value (EVM) | `earned-value.ts` | `dag evm` |
| Gantt Chart | `gantt.ts` | `dag gantt` |
| DAG Runtime Edit | `merge.ts`, `cmd-dag.ts` | `dag add/remove/move/re-init --merge` |

## Routing Targets

| Target | Model | When |
|--------|-------|------|
| opencode | glm-4.7 (free) | complexity <= 40, files <= 5 |
| codexfake | gpt-5.3-codex | specScore >= 80, isolationScore >= 70 |
| claude-app | Sonnet | doc/config/hotfix tasks |
| claude-code | Opus 4.6 | complex/architectural (default) |
| agent-teams | Opus x N | parallel wave >= 3 isolated tasks |

Static rules. No learned thresholds. Use `--agent` to override.

## Quality Gates

| Level | Check | On Failure |
|-------|-------|------------|
| L0 | File exists + non-empty | Error + fix instruction |
| L1 | TypeScript single-file syntax | Error + TS error code guide |
| L2 | spec.interface export verification | Error + "add export" instruction |
| L3 | Project-level tsc --noEmit | Warning (doesn't block commit) |
| L4 | opencode self-review (diff vs spec) | Warning + auto-append to CLAUDE.md |

## Data Flow

```
dag add/init → task JSON files → auto-runner waves
                                     │
                          ┌──────────┼──────────┐
                          ▼          ▼          ▼
                    buildContext  executeTask  commitWave
                    (per target)  (opencode)   (git add+commit)
                          │          │
                          │     quality gate
                          │     L4 review
                          │          │
                          │     CLAUDE.md ← FAIL auto-append
                          │
                    40% Smart Zone budget check

dag complete → auto-learn → brain evolve + entity index
```

## Key Design Decisions

- Zero runtime dependencies (Node.js built-ins only)
- TypeScript strict mode, Node16 module resolution
- Atomic JSON writes with file locking
- LSP-first for code understanding (CLAUDE.md rule)
- Static routing rules (deleted ML-style threshold adaptation in v3.9.1)
- Error messages include fix instructions (OpenAI linter pattern)
- CLAUDE.md as living feedback loop (Hashimoto AGENTS.md pattern)
- Context budget: 40% Smart Zone threshold per target
