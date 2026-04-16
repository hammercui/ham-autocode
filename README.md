# ham-autocode

[![CI](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml/badge.svg)](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml)

> Coordinate multiple AI agents to autonomously complete entire software projects — saving 82% token cost.

**v4.0** | [CHANGELOG](CHANGELOG.md) | [Architecture](ARCHITECTURE.md) | [Guide](docs/GUIDE.md) | [Roadmap](docs/ROADMAP-v4.0.md) | [中文文档](README.zh-CN.md)

## What is it?

Claude Code (Opus) is powerful but expensive and quota-limited. ham-autocode solves this by **splitting tasks and routing them to free/low-cost agents** while maintaining quality:

```
PLAN.md → DAG → Opus writes spec → Route to agent → Execute → Quality gate → Commit → Next wave
```

One command runs the full loop unattended:

```bash
ham-cli execute full-auto              # Run all phases autonomously
ham-cli execute full-auto --push       # Auto git push when done
ham-cli execute full-auto --dry-run    # Preview without executing
```

### Core Capabilities

| Capability | What it does | Key Benefit |
|-----------|-------------|-------------|
| **Task Splitting & Routing** | PLAN.md → DAG → route by complexity to 5 agent targets | Right agent for right task |
| **Autonomous Execution Loop** | Opus spec → dispatch → execute → quality gate → commit → next wave | Zero human intervention |
| **Quality Assurance** | L0-L4 gates + failure diagnosis + L4 retry + fallback chain | Output you can trust |
| **Spec Feedback Loop** (v4.0) | Review failures → inject into next spec → agent avoids same mistakes | Self-improving accuracy |

### 5-Target Routing

| Target | Model | Cost | When |
|--------|-------|------|------|
| opencode | glm-4.7 | Free | Simple tasks: complexity ≤ 40, files ≤ 5 |
| codexfake | gpt-5.3-codex | Low | Mid-complexity: specScore ≥ 80, isolationScore ≥ 70 |
| claude-app | Sonnet | Medium | Doc/config/hotfix tasks |
| claude-code | Opus 4.6 | High | Complex architecture (default fallback) |
| agent-teams | Opus x N | High | Parallel wave ≥ 3 isolated tasks |

Fallback chain: codexfake → opencode → claude-code. Static rules, no ML.

### Quality Gates (L0-L4)

Every task output passes through layered verification. Error messages include fix instructions (OpenAI linter pattern).

| Level | Check | On Failure |
|-------|-------|------------|
| L0 | File exists + non-empty (supports delete/refactor tasks) | `Create the file and implement spec requirements` |
| L1 | TypeScript single-file syntax | `TS error code guide: TS2304/2339/2345/2307` |
| L2 | spec.interface export verification (searches all output files) | `Add export declaration matching spec.interface` |
| L3 | Project-level `tsc --noEmit` | Warning only (project may have pre-existing errors) |
| L4 | AI self-review: diff vs spec → **auto-retry on FAIL** (v4.0) | Warning + fix retry + lesson appended to CLAUDE.md |

**v4.0 additions:** Structured failure diagnosis (5 categories → `diagnosis.jsonl`), L4 FAIL triggers one fix retry with review feedback injected.

### Project Management Engine

Built-in DAG scheduler with classical PM methods for progress tracking:

| Capability | Module | What it does |
|-----------|--------|-------------|
| WBS Parser | `parser.ts` | Parse PLAN.md (headers, checkboxes, tables) → task DAG |
| Topo Sort | `graph.ts` | Kahn's algorithm, cycle detection, dependency resolution |
| Wave Scheduling | `scheduler.ts` | Parallel wave generation based on dependency readiness |
| Critical Path (CPM) | `critical-path.ts` | Forward/backward pass, slack, bottleneck detection |
| PERT / EVM / Gantt | `estimation.ts` `earned-value.ts` `gantt.ts` | Estimation, earned value metrics, ASCII Gantt chart |
| DAG Visualization | `visualize.ts` | ASCII dependency tree with status icons |
| Runtime DAG Edit | `merge.ts` | Diff-merge PLAN.md changes with live state |

## Three-Layer Framework

**gstack thinks → GSD stabilizes → Superpowers executes**

| Framework | Role | What it provides |
|-----------|------|-----------------|
| [gstack](https://github.com/garrytan/gstack) | Strategic thinking | CEO/Eng/Design review, QA, research, ship, deploy |
| [GSD](https://github.com/gsd-build/get-shit-done) | Workflow stability | Phase-driven development, spec enforcement, verification |
| [Superpowers](https://github.com/obra/superpowers) | Execution discipline | TDD, brainstorming, code review, debugging methodology |

ham-autocode orchestrates all three, and follows the **Skill-First principle**: community skills are preferred over self-built code. Self-built modules only cover what community skills don't: multi-agent dispatch, DAG scheduling, and quality gates adapted for autonomous execution.

## Design Philosophy

Informed by Harness Engineering practices (OpenAI, Anthropic, Stripe, Hashimoto) — used as methodology, not as goal:

- **Economic constraint drives architecture** — Opus is expensive → split tasks to free agents → orchestrator stays lean
- **Infrastructure > intelligence** — Same model, better harness = dramatically better results
- **Static rules > ML adaptation** — Routing uses deterministic scoring, not learned thresholds
- **Error messages teach** — Quality gate failures include actionable fix instructions
- **Feedback loops close** — L4 FAIL → CLAUDE.md + review-feedback.jsonl → next spec reads both (v4.0)
- **Skill-First** — Community skills preferred; self-built only wraps or extends them

## Install

**Requirements:** Node.js >= 18, Claude Code

```bash
git clone https://github.com/hammercui/ham-autocode.git
cd ham-autocode && npm ci && npm run build
```

Register as Claude Code plugin:
```bash
claude --plugin-dir ./ham-autocode
```

Verify: `/ham-autocode:status`

## Quick Start

```bash
# Full autonomous execution (core usage)
ham-cli execute full-auto
ham-cli execute full-auto --push --max-phases 3

# Skills
/ham-autocode:auto        # Full pipeline with phase detection
/ham-autocode:detect      # Scan existing project state
/ham-autocode:parallel    # Agent Teams + DAG routing
/ham-autocode:ship        # Review + QA + release (wraps gstack /ship)
```

See [GUIDE.md](docs/GUIDE.md) for a 10-minute onboarding tutorial.

## CLI Commands

```bash
ham-cli <command>     # or: node dist/index.js <command>
```

| Category | Commands |
|----------|----------|
| Execute | `execute auto\|full-auto\|prepare\|run\|auto-status\|stats` |
| DAG | `dag init\|status\|next-wave\|complete\|fail\|skip\|visualize\|critical-path\|estimate\|evm\|gantt` |
| DAG Edit | `dag add\|remove\|add-dep\|remove-dep\|re-init --merge\|scope-cut\|impact\|move` |
| Route | `route <id>\|batch\|confirm` |
| Context | `context summary <file>` |
| Learn | `learn brain\|detail\|scan\|entities\|status` |
| Health | `health check\|quick\|drift\|uncommitted\|esm-cjs` |
| Validate | `validate detect\|gates` |
| Commit | `commit auto\|message\|rollback` |
| Pipeline | `pipeline status\|resume\|log` |

## Verified Evidence

Tested on real projects (ham-video — 53 tasks across 4 milestones):

| Metric | Value |
|--------|-------|
| Unit test suites | 8/8 passing |
| Total tasks completed | 53 (opencode 15/15, codexfake 7/7, full-auto 6/10) |
| full-auto success rate | 60% → 80% (v3.9.3 P0 fixes) → targeting 90% (v4.0) |
| Token cost per task | 35,549 tokens via opencode (free, glm-4.7) |
| Opus spec generation | ~$0.032/task (~27K tokens for 9 specs) |
| Cost savings vs pure Opus | 82% |
| L4 review | Caught real bugs (missing await, 3 defects in eval.ts) |
| Failure diagnosis (v4.0) | 5-category classification → diagnosis.jsonl |
| CI | GitHub Actions, Node 18 + 22 matrix |

## Build & Test

```bash
npm ci && npm run build && npm test
```

## Configuration

Zero-config by default. Override in `.ham-autocode/harness.json`:

```json
{
  "routing": {
    "codexMinSpecScore": 80,
    "codexMinIsolationScore": 70,
    "opencodeGptModel": "github-copilot/gpt-5.3-codex",
    "opencodeGptProviders": ["copilot"]
  },
  "validation": { "mode": "strict", "maxAttempts": 2 },
  "recovery": { "highRiskThreshold": 70 },
  "autoCommit": true
}
```

## License

MIT
