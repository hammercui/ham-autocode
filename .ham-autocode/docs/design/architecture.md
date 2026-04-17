# ham-autocode Architecture (v4.0)

> Coordinate multiple AI agents to autonomously complete entire software projects.
> 7-layer architecture informed by Harness Engineering practices — used as methodology, not as goal.

## Design Principles

- **Economic constraint drives architecture** — Opus is expensive → split tasks to free agents → orchestrator stays lean
- **Infrastructure > intelligence** — Same model, better harness = dramatically better results
- **Static rules > ML adaptation** — Routing uses deterministic scoring, not learned thresholds
- **Error messages teach** — Quality gate failures include actionable fix instructions
- **Feedback loops close** — L4 FAIL → CLAUDE.md + review-feedback.jsonl → next spec reads both (v4.0)
- **Skill-First** — Community skills preferred; self-built only wraps or extends them
- **Zero runtime dependencies** — Node.js built-ins only, TypeScript strict mode

## 7-Layer Architecture

| Layer | What it solves | Key Modules |
|-------|---------------|-------------|
| **Context Engine** | Right context for right agent — per-target templates, 40% Smart Zone budget | `context-template.ts` `summary-cache.ts` |
| **DAG Orchestration** | Task dependency scheduling — topo sort, wave parallelism, CPM, runtime editing | `parser.ts` `graph.ts` `scheduler.ts` `critical-path.ts` `merge.ts` |
| **Validation Gates** | Layered quality assurance — L0-L4 gates, failure diagnosis, L4 auto-retry (v4.0) | `quality-gate.ts` `review-gate.ts` `diagnosis.ts` |
| **Recovery Engine** | Fault tolerance — git checkpoint, worktree isolation, fallback chain | `recovery/checkpoint.ts` `recovery/worktree.ts` |
| **Agent Routing** | Cost-optimal dispatch — 5-target scoring, quota tracking, static rules | `router.ts` `scorer.ts` `quota.ts` |
| **Spec Engine** | Spec quality drives success — Opus generation, feedback loop, TDD requirements (v4.0) | `spec-generator.ts` `spec/reader.ts` `spec/enricher.ts` |
| **Knowledge Compounding** | Cross-session learning — project brain, code entities, auto-learn after each task | `project-brain.ts` `code-entities.ts` `auto-learn.ts` |

---

### Layer 1: Context Engine

Agents work best with the right amount of context — too little and they miss requirements, too much and they lose focus. The Context Engine tailors each bundle per target:

| Target | Context Size | What's Included |
|--------|-------------|-----------------|
| opencode | ~1K tokens | Task spec + file paths |
| codexfake | ~2K tokens | + reading list + dependency outputs |
| claude-code | ~3-5K tokens | + brain context + conventions + entity search |

Budget: 40% Smart Zone threshold — context beyond 40% of window degrades output quality.

Key functions: `buildMinimalContext()`, `getReadingList()`, `getDependencyOutputs()`, `getConventions()`.

### Layer 2: DAG Orchestration

PLAN.md is parsed into a directed acyclic graph. Tasks execute in dependency-respecting waves:

```
dag init PLAN.md   →   Wave 1: [A, B]   →   Wave 2: [C, D]   →   Wave 3: [E]
                       (parallel)             (parallel)            (depends on C+D)
```

| Capability | Module | CLI |
|-----------|--------|-----|
| WBS Parser | `parser.ts` | `dag init [PLAN.md]` |
| Topo Sort | `graph.ts` | Kahn's algorithm, cycle detection |
| Wave Scheduling | `scheduler.ts` | `dag next-wave` |
| Critical Path (CPM) | `critical-path.ts` | `dag critical-path` |
| PERT Estimation | `estimation.ts` | `dag estimate` |
| Earned Value (EVM) | `earned-value.ts` | `dag evm` |
| Gantt Chart | `gantt.ts` | `dag gantt` |
| DAG Visualization | `visualize.ts` | `dag visualize` |
| Runtime DAG Edit | `merge.ts` | `dag add/remove/move/re-init --merge/scope-cut/impact` |

### Layer 3: Validation Gates

Every task output passes through layered verification. Error messages include actionable fix instructions (OpenAI linter pattern).

| Level | Check | On Failure |
|-------|-------|------------|
| L0 | File exists + non-empty (supports delete/refactor tasks) | `Create the file and implement spec requirements` |
| L1 | TypeScript single-file syntax | `TS error code guide: TS2304/2339/2345/2307` |
| L2 | spec.interface export verification (searches all output files) | `Add export declaration matching spec.interface` |
| L3 | Project-level `tsc --noEmit` | Warning only (project may have pre-existing errors) |
| L4 | AI self-review: diff vs spec → **auto-retry on FAIL** (v4.0) | Fix retry + lesson appended to CLAUDE.md |

**v4.0 additions:**
- **Structured failure diagnosis** (`diagnosis.ts`): classifies every skip into 5 categories with suggested actions → `diagnosis.jsonl`
  - `spec-issue` — spec description unclear or file paths wrong → regenerate spec
  - `agent-limitation` — agent can't handle this complexity → upgrade or split task
  - `env-issue` — tsconfig/dependency/permission problem → fix environment
  - `dep-missing` — upstream output missing → check blockedBy
  - `unknown` — needs manual analysis
- **L4 FAIL retry**: review feedback injected into context → same agent re-executes once

### Layer 4: Recovery Engine

| Strategy | When | What it does |
|----------|------|-------------|
| Checkpoint | complexity < 70 | Git tag before execution, rollback on failure |
| Worktree | complexity >= 70 | Git worktree isolation, discard on failure |
| Fallback chain | Agent fails | codexfake → opencode → claude-code |
| Auto-skip | Same error 2x | Stop retrying, diagnose, move on |
| Timeout recovery | Files created but process hung | Run quality gate on partial output → may pass |
| Cooldown | Agent fails 2x consecutively | 30 min cooldown, auto-recover |

### Layer 5: Agent Routing

5 targets, static rules, no ML. Cost optimization is the primary driver.

| Target | Model | Cost | When |
|--------|-------|------|------|
| opencode | glm-4.7 | Free | Simple: complexity ≤ 40, files ≤ 5 |
| codexfake | gpt-5.3-codex | Low | Mid: specScore ≥ 80, isolationScore ≥ 70 |
| claude-app | Sonnet | Medium | Doc/config/hotfix tasks |
| claude-code | Opus 4.6 | High | Complex architecture (default fallback) |
| agent-teams | Opus x N | High | Parallel wave ≥ 3 isolated tasks |

Routing uses 3-dimension scoring: `specScore` (spec quality), `complexityScore` (task complexity), `isolationScore` (file independence). Use `--agent` to override.

### Layer 6: Spec Engine

"When the spec is right, implementation follows naturally." — Boris Tane

Opus writes detailed specs (the key intelligence investment); free agents execute them (labor).

| Capability | What it does |
|-----------|-------------|
| Opus Generation | `claude -p` generates JSON spec (description, interface, acceptance, files, complexity) |
| Project File Tree | Spec prompt includes file tree (depth 3, max 100 lines) — Opus doesn't guess paths |
| Feedback Loop (v4.0) | review-feedback.jsonl FAIL records injected into next spec — same mistakes not repeated |
| CLAUDE.md Loop (v4.0) | Project CLAUDE.md lessons injected into spec prompt — cross-session learning |
| TDD Requirements (v4.0) | Spec requests testFile + testCases for complexity ≥ 50 |
| Preflight Check | Validates spec quality before execution (description length, acceptance count, parameter docs) |

### Layer 7: Knowledge Compounding

Cross-session continuity without ML complexity:

| Module | What it stores | How it's used |
|--------|---------------|---------------|
| Project Brain | Pain points, proven patterns, architecture connections | Injected into agent context via `getBrainContext()` |
| Code Entities | Function/class/interface index per file | `searchEntities()` for relevant code discovery |
| Auto-learn | Triggered after each `dag complete` | Updates brain + entity index incrementally |

**Status:** Architecture reserved. Brain and entities are wired into `context-template.ts`, but ROI is not yet validated in full-auto. The layer is maintained for future iteration.

---

## Execution Data Flow

```
PLAN.md → dag init → task JSON files
                          │
                    phase-loop.ts (full-auto outer loop)
                          │
                    ┌─────┴─────┐
                    ▼           ▼
              spec-generator  routeTask
              (Opus claude -p) (5-target scoring)
                    │           │
                    └─────┬─────┘
                          ▼
                    auto-runner.ts (wave inner loop)
                          │
               ┌──────────┼──────────┐
               ▼          ▼          ▼
         buildContext  executeTask  commitWave
         (per target)  (opencode)   (git add+commit)
               │          │
               │     quality gate (L0→L1→L2)
               │     L4 review → retry on FAIL (v4.0)
               │     diagnosis on skip (v4.0)
               │          │
               │     CLAUDE.md ← FAIL auto-append
               │
         40% Smart Zone budget check

dag complete → auto-learn → brain evolve + entity index
```

## Directory Map

| Path | Purpose | LoC |
|------|---------|-----|
| `core/commands/` | CLI command handlers (8 files) | ~940 |
| `core/dag/` | DAG: scheduler, parser, CPM, PERT, EVM, Gantt, merge, graph | ~865 |
| `core/executor/` | auto-runner, phase-loop, spec-generator, quality-gate, review-gate, diagnosis, context-template, dispatcher | ~2,970 |
| `core/routing/` | 5-target scorer + static router + quota | ~214 |
| `core/spec/` | OpenSpec reader, enricher, sync | ~451 |
| `core/state/` | Atomic JSON, pipeline, task-graph, config, validator, lock | ~419 |
| `core/learning/` | Project brain, code entities, auto-learn | ~759 |
| `core/health/` | Health check, drift, ESM/CJS, uncommitted analyzer | ~1,378 |
| `core/recovery/` | Git checkpoint, worktree isolation | ~204 |
| `core/context/` | File summary cache | ~168 |
| `core/types/` | Domain types (pipeline, task, config, engine) | ~278 |
| `core/validation/` | Validation gate detection | ~219 |
| `core/trace/` | Execution trace logging | ~278 |
| `core/rules/` | Guardrail rules engine | ~206 |
| `core/commit/` | Auto-commit after wave | ~72 |
| `core/utils/` | Token estimation, git wrapper | ~156 |
| `core/research/` | Competitive analysis data layer | ~138 |

## Three-Layer Framework

```
gstack (strategic thinking)  →  GSD (workflow stability)  →  Superpowers (execution discipline)
  CEO/Eng/Design review           Phase-driven dev              TDD, code review
  QA, research, ship              Spec enforcement              Brainstorming, debugging
  Office hours                    Verification gates            Verification before completion
```

ham-autocode sits at the center, orchestrating all three frameworks via skills. See README.md "Skill Map by Phase" for the complete mapping of which skill is used at each project lifecycle stage.
