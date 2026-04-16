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

The architecture is informed by Harness Engineering practices (OpenAI, Anthropic, Stripe, Hashimoto) — used as methodology, not as goal. The project follows a **Skill-First principle**: community skills (gstack, GSD, Superpowers) are preferred; self-built modules only cover what they don't — multi-agent dispatch, DAG scheduling, and quality gates for autonomous execution.

## 7-Layer Architecture

| Layer                     | What it solves                                                                        | Key Modules                                                         |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Context Engine**        | Right context for right agent — per-target templates, 40% Smart Zone budget           | `context-template.ts` `summary-cache.ts`                            |
| **DAG Orchestration**     | Task dependency scheduling — topo sort, wave parallelism, CPM, runtime editing        | `parser.ts` `graph.ts` `scheduler.ts` `critical-path.ts` `merge.ts` |
| **Validation Gates**      | Layered quality assurance — L0-L4 gates, failure diagnosis, L4 auto-retry (v4.0)      | `quality-gate.ts` `review-gate.ts` `diagnosis.ts`                   |
| **Recovery Engine**       | Fault tolerance — git checkpoint, worktree isolation, fallback chain                  | `recovery/checkpoint.ts` `recovery/worktree.ts`                     |
| **Agent Routing**         | Cost-optimal dispatch — 5-target scoring, quota tracking, static rules                | `router.ts` `scorer.ts` `quota.ts`                                  |
| **Spec Engine**           | Spec quality drives success — Opus generation, feedback loop, TDD requirements (v4.0) | `spec-generator.ts` `spec/reader.ts` `spec/enricher.ts`             |
| **Knowledge Compounding** | Cross-session learning — project brain, code entities, auto-learn after each task     | `project-brain.ts` `code-entities.ts` `auto-learn.ts`               |

Each layer is detailed in [ARCHITECTURE.md](ARCHITECTURE.md).

## Three-Layer Framework

**gstack thinks → GSD stabilizes → Superpowers executes**

| Framework                                          | Role                 | What it provides                                         |
| -------------------------------------------------- | -------------------- | -------------------------------------------------------- |
| [gstack](https://github.com/garrytan/gstack)       | Strategic thinking   | CEO/Eng/Design review, QA, research, ship, deploy        |
| [GSD](https://github.com/gsd-build/get-shit-done)  | Workflow stability   | Phase-driven development, spec enforcement, verification |
| [Superpowers](https://github.com/obra/superpowers) | Execution discipline | TDD, brainstorming, code review, debugging methodology   |

ham-autocode orchestrates all three: gstack for direction, GSD for structure, Superpowers for quality.

### Skill Map by Phase

Which skill from which framework is used at each stage of the project lifecycle:

| Phase               | Step                   | Skill                                | Framework        | ham-autocode Role                                |
| ------------------- | ---------------------- | ------------------------------------ | ---------------- | ------------------------------------------------ |
| **1. Ideation**     | Idea validation        | `/office-hours`                      | gstack           | — (direct use)                                   |
|                     | Strategic review       | `/plan-ceo-review`                   | gstack           | —                                                |
|                     | Design review          | `/plan-design-review`                | gstack           | —                                                |
| **2. Requirements** | Project init           | `/gsd:new-project`                   | GSD              | —                                                |
|                     | Milestone creation     | `/gsd:new-milestone`                 | GSD              | —                                                |
|                     | Roadmap generation     | GSD Roadmapper                       | GSD              | —                                                |
| **3. Planning**     | Phase discussion       | `/gsd:discuss-phase --auto`          | GSD              | —                                                |
|                     | Phase planning         | `/gsd:plan-phase`                    | GSD              | —                                                |
|                     | Architecture lock      | `/plan-eng-review`                   | gstack           | —                                                |
|                     | Brainstorming          | `brainstorming`                      | Superpowers      | —                                                |
| **4. Execution**    | Autonomous loop        | `execute full-auto`                  | **ham-autocode** | Core: spec gen → route → execute → gate → commit |
|                     | Spec generation        | `spec-generator.ts`                  | **ham-autocode** | Layer 6: Opus writes spec                        |
|                     | Task routing           | `router.ts`                          | **ham-autocode** | Layer 5: 5-target dispatch                       |
|                     | Quality gates          | `quality-gate.ts`                    | **ham-autocode** | Layer 3: L0-L4 verification                      |
|                     | Failure diagnosis      | `diagnosis.ts`                       | **ham-autocode** | Layer 3: 5-category classification               |
|                     | TDD discipline         | `test-driven-development`            | Superpowers      | Principle: spec requests testFile (v4.0)         |
|                     | Parallel agents        | `dispatching-parallel-agents`        | Superpowers      | Principle: wave-based parallelism                |
| **5. Review**       | UAT verification       | `/gsd:verify-work`                   | GSD              | `skills/ship/` wraps this                        |
|                     | Code review            | `/review`                            | gstack           | `skills/ship/` wraps this                        |
|                     | QA + auto-fix          | `/qa`                                | gstack           | `skills/ship/` wraps this                        |
|                     | L4 AI self-review      | `review-gate.ts`                     | **ham-autocode** | Layer 3: opencode reviews diff vs spec           |
|                     | Verification           | `verification-before-completion`     | Superpowers      | Principle: evidence before assertions            |
| **6. Ship**         | Create PR              | `/ship`                              | gstack           | `skills/ship/` wraps this                        |
|                     | Deploy + verify        | `/land-and-deploy`                   | gstack           | —                                                |
|                     | Post-deploy monitoring | `/canary`                            | gstack           | —                                                |
|                     | Doc update             | `/document-release`                  | gstack           | —                                                |
| **Support**         | Debug failures         | `/investigate`                       | gstack           | Available but not yet auto-integrated            |
|                     | Systematic debugging   | `systematic-debugging`               | Superpowers      | Available for manual use                         |
|                     | Progress check         | `/gsd:progress`                      | GSD              | `skills/status/` extends this                    |
|                     | Pause/resume           | `/gsd:pause-work` `/gsd:resume-work` | GSD              | `skills/resume/` extends this                    |
|                     | Project health         | `/health`                            | gstack           | `skills/health-check/` supplements this          |
|                     | Retrospective          | `/retro`                             | gstack           | Available for periodic review                    |

**Legend:** Skills marked **ham-autocode** are self-built core capabilities (the 7 layers). All others are community skills used directly or wrapped.

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

Check and install missing dependency skill packs (gstack, GSD, Superpowers):

```
/ham-autocode:setup
```

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

| Category | Commands                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------- |
| Execute  | `execute auto\|full-auto\|prepare\|run\|auto-status\|stats`                                         |
| DAG      | `dag init\|status\|next-wave\|complete\|fail\|skip\|visualize\|critical-path\|estimate\|evm\|gantt` |
| DAG Edit | `dag add\|remove\|add-dep\|remove-dep\|re-init --merge\|scope-cut\|impact\|move`                    |
| Route    | `route <id>\|batch\|confirm`                                                                        |
| Context  | `context summary <file>`                                                                            |
| Learn    | `learn brain\|detail\|scan\|entities\|status`                                                       |
| Health   | `health check\|quick\|drift\|uncommitted\|esm-cjs`                                                  |
| Validate | `validate detect\|gates`                                                                            |
| Commit   | `commit auto\|message\|rollback`                                                                    |
| Pipeline | `pipeline status\|resume\|log`                                                                      |

## Verified Evidence

Tested on real projects (ham-video — 53 tasks across 4 milestones):

| Metric                    | Value                                                  |
| ------------------------- | ------------------------------------------------------ |
| Unit test suites          | 8/8 passing                                            |
| Total tasks completed     | 53 (opencode 15/15, codexfake 7/7, full-auto 6/10)     |
| full-auto success rate    | 60% → 80% (v3.9.3) → targeting 90% (v4.0)              |
| Token cost per task       | 35,549 tokens via opencode (free, glm-4.7)             |
| Opus spec generation      | ~$0.032/task (~27K tokens for 9 specs)                 |
| Cost savings vs pure Opus | 82%                                                    |
| L4 review                 | Caught real bugs (missing await, 3 defects in eval.ts) |
| Failure diagnosis (v4.0)  | 5-category classification → diagnosis.jsonl            |
| CI                        | GitHub Actions, Node 18 + 22 matrix                    |

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
