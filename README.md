# ham-autocode

[![CI](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml/badge.svg)](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml)

> Claude Code Plugin for fully autonomous project development.
> Harness Architecture aligned with [Harness Engineering Four Pillars](docs/Harness%20Engineering%20深度解析：AI%20Agent%20时代的工程范式革命%201.md): Context Architecture, Agent Specialization, Persistent Memory, Structured Execution.

**v3.9.1** | [CHANGELOG](CHANGELOG.md) | [Architecture](ARCHITECTURE.md) | [Guide](docs/GUIDE.md) | [Examples](examples/) | [中文文档](README.zh-CN.md)

## What is it?

The **Harness** layer that turns AI coding agents from "can run" into "runs reliably":

| Pillar | What it solves | Key Modules |
|--------|---------------|-------------|
| Context Architecture | Right context for right agent — no more, no less. 40% Smart Zone budget control | context-template, summary-cache |
| Agent Specialization | 5-target routing: opencode (free) / codexfake (mid) / claude-code (complex) / claude-app / agent-teams | router, scorer |
| Persistent Memory | Cross-session continuity via CHECKPOINT.md, DAG state, git log. CLAUDE.md as living feedback loop | DAG state, review-gate → CLAUDE.md |
| Structured Execution | DAG → wave scheduling → quality gates (L0-L4) → auto-commit. Runtime DAG editing (v3.9) | auto-runner, quality-gate, review-gate |

### Quality Gates (L0-L4)

Every task output passes through layered verification. Error messages include fix instructions (OpenAI linter pattern).

| Level | Check | On Failure |
|-------|-------|------------|
| L0 | File exists + non-empty | `Create the file and implement spec requirements` |
| L1 | TypeScript single-file syntax | `TS error code guide: TS2304/2339/2345/2307` |
| L2 | spec.interface export verification | `Add export declaration matching spec.interface` |
| L3 | Project-level `tsc --noEmit` | Warning only (project may have pre-existing errors) |
| L4 | AI self-review: opencode reviews diff vs spec | Warning + auto-append lesson to CLAUDE.md |

### Project Management Engine (DAG + PM Methods)

Built-in project management based on WBS decomposition and classical PM theory:

| Capability | Module | What it does |
|-----------|--------|-------------|
| WBS Parser | `parser.ts` | Parse PLAN.md/WBS.md (3 formats: markdown headers, checkboxes, tables) → task DAG |
| Topo Sort | `graph.ts` | Kahn's algorithm, cycle detection, dependency resolution |
| Wave Scheduling | `scheduler.ts` | Parallel wave generation based on dependency readiness |
| Critical Path (CPM) | `critical-path.ts` | Forward/backward pass, slack calculation, bottleneck detection |
| PERT Estimation | `estimation.ts` | Three-point estimation (optimistic/likely/pessimistic) per task |
| Earned Value (EVM) | `earned-value.ts` | PV/EV/AC/SPI/CPI/EAC — project health at a glance |
| Gantt Chart | `gantt.ts` | ASCII Gantt with critical path highlighted |
| DAG Visualization | `visualize.ts` | ASCII dependency tree with status icons |
| Runtime DAG Edit | `merge.ts` | Diff-merge PLAN.md changes with live state (v3.9) |

## Three-Layer Framework

**gstack thinks → GSD stabilizes → Superpowers executes**

| Framework | Author | Role | What it provides |
|-----------|--------|------|-----------------|
| [gstack](https://github.com/garrytan/gstack) | Garry Tan | Strategic thinking | CEO/Designer/Eng review, QA, research, design system |
| [GSD](https://github.com/gsd-build/get-shit-done) | TACHES | Workflow stability | Phase-driven development, spec enforcement, verification |
| [Superpowers](https://github.com/obra/superpowers) | Jesse Vincent | Execution discipline | TDD, brainstorming, code review, debugging methodology |

ham-autocode orchestrates all three: gstack for direction, GSD for structure, Superpowers for quality.

## Design Philosophy

Based on industry consensus from OpenAI, Anthropic, Stripe, and Hashimoto:

- **Infrastructure > Intelligence** — Same model, better harness = dramatically better results
- **Static rules > ML adaptation** — Routing uses deterministic scoring, not learned thresholds
- **Simplify, don't complexify** — v3.9.1 deleted 1,760 lines of over-engineered "learning" code
- **Error messages teach** — Quality gate failures include fix instructions (OpenAI linter pattern)
- **CLAUDE.md as feedback loop** — L4 review failures auto-append to CLAUDE.md (Hashimoto AGENTS.md pattern)

## Install

**Requirements:** Node.js >= 18, Claude Code

```bash
git clone https://github.com/hammercui/ham-autocode.git
cd ham-autocode && npm ci && npm run build
claude --plugin-dir ./ham-autocode
```

Verify: `/ham-autocode:status`

## Quick Start

```
/ham-autocode:auto        # Full autonomous pipeline
/ham-autocode:detect      # Scan existing project state
/ham-autocode:parallel    # Agent Teams + DAG routing
/ham-autocode:ship        # Review + QA + release
```

See [GUIDE.md](docs/GUIDE.md) for a 10-minute onboarding tutorial.

## CLI Commands

```bash
node dist/index.js <command>
```

| Category | Commands |
|----------|----------|
| DAG | `dag init\|status\|next-wave\|complete\|fail\|visualize\|critical-path\|estimate\|evm\|gantt` |
| DAG Edit (v3.9) | `dag add\|remove\|add-dep\|remove-dep\|re-init --merge\|scope-cut\|impact\|move` |
| Route | `route <id>\|batch\|confirm` |
| Execute | `execute prepare\|run\|auto\|auto-status\|stats` |
| Context | `context summary <file>` |
| Learn | `learn brain\|detail\|scan\|entities\|status` |
| Health | `health check\|drift\|uncommitted\|esm-cjs` |
| Validate | `validate detect\|gates` |

## Verified Evidence

Tested on real projects (ham-video — 43 tasks across 3 milestones):

- **8/8 unit test suites passing**
- **43 tasks completed**: opencode 15/15 (100%), codexfake 7/7 (100%)
- **Average task time**: 91s (opencode), 80s (codexfake)
- **Token cost**: 35,549 tokens/task via opencode (free, glm-4.7)
- **Orchestrator overhead**: ~7,400 tokens / 37 tasks (93% savings)
- **L4 review**: Caught real bug (missing await) in ham-video v0.3
- **DAG Change Management**: Runtime task insertion/removal/reorder during execution
- **CI**: GitHub Actions with Node 18 + 22 matrix

## Build & Test

```bash
npm ci && npm run build && npm test
```

## Configuration

Zero-config by default. Override in `.ham-autocode/harness.json`:

```json
{
  "routing": { "codexMinSpecScore": 80, "codexMinIsolationScore": 70 },
  "validation": { "mode": "strict", "maxAttempts": 2 },
  "recovery": { "highRiskThreshold": 70 }
}
```

## License

MIT
