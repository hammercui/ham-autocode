# ham-autocode

[![CI](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml/badge.svg)](https://github.com/hammercui/ham-autocode/actions/workflows/ci.yml)

> Claude Code Plugin for fully autonomous project development.
> Harness Architecture: DAG scheduler, context engine, agent routing, validation gates, recovery, knowledge compounding.

**v3.5.0** | [CHANGELOG](CHANGELOG.md) | [Architecture](ARCHITECTURE.md) | [Guide](GUIDE.md) | [Examples](examples/)

## What is it?

The **Harness** layer that turns AI coding agents from "can run" into "runs reliably":

| Layer | What it solves |
|-------|---------------|
| Context Engine | Token budget, file summaries, TF-IDF search, progressive disclosure |
| DAG Orchestration | Topo sort, wave scheduling, CPM/EVM/Gantt |
| Validation Gates | Auto-detect lint/test, two-strike policy |
| Recovery Engine | Git checkpoint + worktree isolation |
| Agent Routing | 5-target scoring (Claude Code/Codex/App/Teams/OpenCode) + quota fallback |
| Spec Engine | OpenSpec integration + heuristic enrichment |
| Knowledge Compounding | Brain, entities, patterns, guard — auto-learn on every task |

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
/ham-autocode:auto        # Full 6-phase pipeline
/ham-autocode:detect      # Scan existing project state
/ham-autocode:parallel    # Agent Teams + DAG routing
/ham-autocode:ship        # Review + QA + release
/ham-autocode:setup       # Install missing dependencies (gstack/GSD/Superpowers)
```

See [GUIDE.md](GUIDE.md) for a 10-minute onboarding tutorial.

## Skills (10)

| Skill | Purpose |
|-------|---------|
| detect | Scan project, skip completed phases |
| auto | Full 6-phase autonomous pipeline |
| parallel | Agent Teams + DAG routing |
| ship | Review + QA + fix + release |
| status | Show progress / pause pipeline |
| resume | Continue from saved state |
| pause | Pause with state preservation |
| setup | Install missing skill packs |
| health-check | Project health score (git/compile/test/deps/lint) |
| research | Competitive analysis |

## CLI Commands (45+)

```bash
node dist/index.js <command>
```

| Category | Commands |
|----------|----------|
| Config | `config show` |
| DAG | `dag init`, `dag status`, `dag next-wave`, `dag complete <id>`, `dag fail <id> <type>`, `dag visualize`, `dag critical-path`, `dag estimate`, `dag evm`, `dag gantt` |
| Route | `route <id>`, `route batch`, `route confirm <id>` |
| Execute | `execute prepare <id>` |
| Context | `context budget`, `context summary <file>`, `context search <query>` |
| Learn | `learn brain`, `learn detail <topic>`, `learn scan`, `learn analyze`, `learn suggest`, `learn apply`, `learn patterns`, `learn hints <name>`, `learn entities`, `learn deps`, `learn impact <files>`, `learn guard`, `learn field-test` |
| Health | `health check`, `health drift`, `health uncommitted`, `health esm-cjs` |
| Validate | `validate detect`, `validate gates` |
| Quota | `quota status`, `quota mark-unavailable <target>`, `quota mark-available <target>` |
| Teams | `teams assign`, `teams should-use` |

## Verified Evidence

Tested on real projects (ham-video — Electron desktop video pipeline):

- **8/8 unit test suites passing** (token, git, lock, atomic, DAG, routing, context, CLI)
- **Complete execution loop**: PLAN.md → dag init → route → codex exec → compile → commit → dag complete
- **12-task DAG** with dependency resolution, wave scheduling, and 5-target routing
- **Codex auto-execution**: 2 tasks successfully executed by Codex with zero manual intervention
- **Memory progressive disclosure**: ~150 token compact index vs ~400 token full dump (-60%)
- **CI**: GitHub Actions with Node 18 + 22 matrix on every push

## Dependencies

| Framework | Role | Install |
|-----------|------|---------|
| [GSD](https://github.com/gsd-build/get-shit-done) | Project init, milestones, execution | `git clone --depth 1 https://github.com/gsd-build/get-shit-done.git ~/.claude/plugins/gsd` |
| [gstack](https://github.com/garrytan/gstack) | Idea review, QA, shipping | `git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack` |
| [Superpowers](https://github.com/nichochar/superpowers) | TDD methodology | `git clone --depth 1 https://github.com/nichochar/superpowers.git ~/.claude/plugins/superpowers` |

## Build & Test

```bash
npm ci              # Install dependencies
npm run build       # TypeScript → dist/
npm test            # Run 8 test suites
npm run test:quick  # Build + test in one step
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
