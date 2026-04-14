# ham-autocode

> Claude Code Plugin for fully autonomous project development.
> Harness Architecture: DAG scheduler, context engine, agent routing, validation gates, recovery, knowledge compounding.

**v3.4.0** | [CHANGELOG](CHANGELOG.md) | [Architecture](ARCHITECTURE.md)

## What is it?

The **Harness** layer that turns AI coding agents from "can run" into "runs reliably":

| Layer | What it solves |
|-------|---------------|
| Context Engine | Token budget, file summaries, TF-IDF search |
| DAG Orchestration | Topo sort, wave scheduling, CPM/EVM/Gantt |
| Validation Gates | Auto-detect lint/test, two-strike policy |
| Recovery Engine | Git checkpoint + worktree isolation |
| Agent Routing | 5-target scoring (Claude Code/Codex/App/Teams/OpenCode) + quota fallback |
| Spec Engine | OpenSpec integration + heuristic enrichment |
| Knowledge Compounding | Brain, entities, patterns, guard — auto-learn on every task |

## Install

```bash
git clone https://github.com/hammercui/ham-autocode.git
claude --plugin-dir ./ham-autocode
```

Verify: `/ham-autocode:status`

## Quick Start

```
/ham-autocode:auto        # Full 6-phase pipeline
/ham-autocode:detect      # Scan existing project state
/ham-autocode:parallel    # Agent Teams + DAG routing
/ham-autocode:ship        # Review + QA + release
/ham-autocode:setup       # Install missing dependencies (gstack/GSD/Superpowers)
```

## Skills (9)

| Skill | Purpose |
|-------|---------|
| detect | Scan project, skip completed phases |
| auto | Full 6-phase autonomous pipeline |
| parallel | Agent Teams + DAG routing |
| ship | Review + QA + fix + release |
| status | Show progress / pause pipeline |
| resume | Continue from saved state |
| setup | Install missing skill packs |
| health-check | Project health score (git/compile/test/deps/lint) |
| research | Competitive analysis |

## Dependencies

| Framework | Role | Install |
|-----------|------|---------|
| [GSD](https://github.com/gsd-build/get-shit-done) | Project init, milestones, execution | `git clone --depth 1 ...gsd-build/get-shit-done.git ~/.claude/plugins/gsd` |
| [gstack](https://github.com/garrytan/gstack) | Idea review, QA, shipping | `git clone --depth 1 ...garrytan/gstack.git ~/.claude/skills/gstack` |
| [Superpowers](https://github.com/obra/superpowers) | TDD methodology | `git clone --depth 1 ...obra/superpowers.git ~/.claude/plugins/superpowers` |

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
