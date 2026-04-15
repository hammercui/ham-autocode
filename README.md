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
