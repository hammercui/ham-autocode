# ham-autocode

> Claude Code Plugin for fully autonomous project development.
> Orchestrates gstack + GSD + Superpowers + Agent Teams through a 6-phase pipeline with a Node.js Core Engine.

**v2.0.0** | [CHANGELOG](CHANGELOG.md) | [Architecture](ARCHITECTURE.md)

---

## What is ham-autocode?

ham-autocode is a **Claude Code Plugin** that automates the entire software development lifecycle:

```
Idea --> Initiation --> Requirements --> Planning --> Execution --> Review --> Ship
         (gstack)        (GSD)          (GSD)      (Agent Teams)  (gstack)  (gstack)
```

It combines three community frameworks into a unified pipeline:

| Framework | Role | What it does |
|-----------|------|-------------|
| **gstack** | Decision layer | CEO review, QA testing, shipping |
| **GSD** | Stability layer | Project init, milestones, autonomous execution |
| **Superpowers** | Execution layer | TDD methodology, code review, debugging |

The v2.0 **Core Engine** (Node.js, zero dependencies) adds: DAG task scheduling, context budget management, intelligent agent routing, validation gates, and recovery mechanisms.

---

## Installation

### Prerequisites

- **Claude Code** v2.1.32+ (`npm install -g @anthropic-ai/claude-code`)
- **Node.js** v18+ (for the Core Engine CLI)
- At least one framework skill pack installed (GSD, gstack, or Superpowers)

### Option 1: Local Development (recommended to start)

```bash
# Clone the repo
git clone https://github.com/hammercui/ham-autocode.git

# Launch Claude Code with the plugin loaded
claude --plugin-dir ./ham-autocode
```

### Option 2: Install from GitHub

```bash
# Inside a Claude Code session
claude plugin install hammercui/ham-autocode
```

### Option 3: Per-project Installation

```bash
# Copy to your project (becomes project-scoped)
cp -r ham-autocode /path/to/your/project/.claude/plugins/ham-autocode
```

### Verify Installation

After launching Claude Code with the plugin:

```
/ham-autocode:status
```

If it responds (even with "no pipeline found"), the plugin is loaded.

You can also verify the Core Engine directly:

```bash
node ham-autocode/core/index.js help
```

---

## Quick Start

### Scenario 1: New Project from Scratch

```
/ham-autocode:auto
```

This runs the full 6-phase pipeline automatically:
1. **Initiation** - `/office-hours` idea validation + `/plan-ceo-review`
2. **Requirements** - `/gsd:new-project` + `/gsd:new-milestone`
3. **Planning** - `/gsd:discuss-phase` + `/gsd:plan-phase` per phase
4. **Execution** - `/gsd:autonomous` or Agent Teams parallel execution
5. **Review** - `/gsd:verify-work` + `/review` + `/qa`
6. **Ship** - `/ship` + `/document-release`

At key decision points, it pauses and asks for your input.

### Scenario 2: Continue an Existing Project

```
/ham-autocode:detect
```

Scans your project's files, git history, and documentation to determine which phases are already complete, then recommends where to continue. Never re-executes completed work.

Example output:
```
Project State: Phase 4 - Development (65%)
  Phase 1 Initiation .......... DONE
  Phase 2 Requirements ........ DONE
  Phase 3 Planning ............ DONE
  Phase 4 Development ......... IN PROGRESS (4 tasks remaining)
  Phase 5 Review .............. NOT STARTED
  Phase 6 Ship ................ NOT STARTED

Next: Fix 6 HIGH issues, then complete 4 P0 features.
```

### Scenario 3: Parallel Development (Large Projects)

```
/ham-autocode:parallel
```

Uses the DAG scheduler to identify independent tasks, scores them on 3 dimensions (spec clarity, complexity, isolation), then routes them:
- **Claude Code** - complex architecture, multi-file coordination
- **Codex** - clear requirements with defined file paths + interfaces
- **Claude App** - docs, config, trivial fixes

Creates Agent Teams (3-5 teammates) for Claude Code tasks, generates structured specs for Codex tasks.

### Scenario 4: Code is Done, Ship It

```
/ham-autocode:ship
```

Runs: validation gates --> code review --> QA testing --> auto-fix --> create PR --> update docs.

---

## All 7 Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| **detect** | `/ham-autocode:detect` | Scan project state, skip completed phases |
| **auto** | `/ham-autocode:auto` | Full 6-phase autonomous pipeline |
| **parallel** | `/ham-autocode:parallel` | Agent Teams + DAG routing |
| **ship** | `/ham-autocode:ship` | Review + QA + fix + release |
| **status** | `/ham-autocode:status` | Show pipeline progress |
| **pause** | `/ham-autocode:pause` | Save state and stop gracefully |
| **resume** | `/ham-autocode:resume` | Continue from saved state |

---

## Core Engine CLI

The Core Engine is a pure Node.js CLI (zero npm dependencies) that skills call for state management, task scheduling, and routing decisions.

```bash
node core/index.js <command> [subcommand] [options]
```

### Pipeline State

```bash
node core/index.js pipeline init "my-project"    # Initialize pipeline
node core/index.js pipeline status                # Read current state
node core/index.js pipeline log "started phase 4" # Append log entry
node core/index.js pipeline pause                 # Set status to paused
node core/index.js pipeline resume                # Set status to running
node core/index.js pipeline mark-interrupted      # Mark as interrupted (used by hooks)
```

### DAG Task Scheduling

```bash
node core/index.js dag init PLAN.md M001 phase-1  # Parse plan into tasks
node core/index.js dag status                      # Show completion stats
node core/index.js dag next-wave                   # Get next executable tasks
node core/index.js dag complete <task-id>           # Mark task done
node core/index.js dag fail <task-id> <error-type>  # Mark task failed
node core/index.js dag retry <task-id>              # Reset task to pending
node core/index.js dag skip <task-id>               # Skip a task
```

### Agent Routing

```bash
node core/index.js route batch            # Route all pending tasks
node core/index.js route <task-id>        # Route single task (returns scores + target)
node core/index.js route confirm <task-id> # Confirm high-risk routing decision
```

### Context Budget

```bash
node core/index.js context budget              # Show token usage level
node core/index.js context prepare <task-id>   # Estimate tokens for a task
```

### Validation Gates

```bash
node core/index.js validate detect        # Auto-detect available gates (lint, test, etc.)
node core/index.js validate <task-id>     # Run gates for a task (two-strike policy)
```

### Recovery

```bash
node core/index.js recover checkpoint <task-id>      # Create git tag checkpoint
node core/index.js recover rollback <task-id>         # Rollback to checkpoint
node core/index.js recover worktree-create <task-id>  # Create isolated worktree
node core/index.js recover worktree-merge <task-id>   # Merge worktree back
node core/index.js recover worktree-remove <task-id>  # Remove worktree
```

### Config & Utilities

```bash
node core/index.js config show            # Show effective config (defaults + overrides)
node core/index.js config validate        # Validate config values
node core/index.js token estimate <file>  # Estimate token count for a file
node core/index.js token index [dir]      # Build file index with token estimates
```

---

## Configuration

The Core Engine works with zero configuration. To customize, create `.ham-autocode/harness.json` in your target project:

```json
{
  "context": {
    "advisoryThreshold": 30,
    "compressThreshold": 50,
    "criticalThreshold": 70
  },
  "validation": {
    "mode": "strict",
    "maxAttempts": 2,
    "gates": ["lint", "typecheck", "test"],
    "onFinalFail": "block"
  },
  "routing": {
    "confirmThreshold": 90,
    "codexMinSpecScore": 80,
    "codexMinIsolationScore": 70,
    "defaultTarget": "claude-code"
  },
  "recovery": {
    "lowRiskStrategy": "checkpoint",
    "highRiskThreshold": 70,
    "highRiskStrategy": "worktree"
  }
}
```

Only include the fields you want to override. Missing fields use defaults.

---

## Runtime State

When running, ham-autocode creates a `.ham-autocode/` directory in your **target project** (not in the plugin itself):

```
your-project/
  .ham-autocode/
    pipeline.json          # Pipeline state (phase, status, log)
    harness.json           # Optional user config overrides
    tasks/
      task-001.json        # Individual task state
      task-002.json
    logs/
```

This directory is git-ignored by default. The pipeline.json file enables:
- `/ham-autocode:status` to show real-time progress
- `/ham-autocode:pause` to save exact position
- `/ham-autocode:resume` to continue from where you left off
- Automatic crash recovery (SessionEnd hook marks as "interrupted")

---

## Three-Tool Workflow

ham-autocode is designed to work with three tools simultaneously:

```
You (human)
  |
  v
Claude App (Project Manager)
  |  - Talk to you about progress and decisions
  |  - Run /ham-autocode:detect, /ham-autocode:status
  |  - Lightweight coding (config, docs, hotfix)
  |
  +---> Claude Code (Lead Engineer)
  |      - Run /ham-autocode:auto, /ham-autocode:parallel
  |      - Full skill chain execution
  |      - Agent Teams (3-5 parallel teammates)
  |      - Heavy coding + Git + testing + deploy
  |
  +---> Codex (Capable Engineer)
         - Takes structured task specs from /ham-autocode:parallel
         - Any task with clear requirements (file paths + interfaces + acceptance criteria)
         - Not limited to simple tasks — clarity is the key, not complexity
```

---

## Pause & Resume

```bash
# Pause anytime (saves exact position)
/ham-autocode:pause

# Resume later (even in a new session)
/ham-autocode:resume
```

If a session crashes, the SessionEnd hook automatically marks the pipeline as "interrupted". Next session, `/ham-autocode:resume` detects this and continues from the last checkpoint.

---

## Plugin Structure

```
ham-autocode/
  .claude-plugin/
    plugin.json              # Plugin manifest (name, version, description)
  skills/                    # 7 skills (slash commands)
    detect/SKILL.md          # /ham-autocode:detect
    auto/SKILL.md            # /ham-autocode:auto
    parallel/SKILL.md        # /ham-autocode:parallel
    ship/SKILL.md            # /ham-autocode:ship
    status/SKILL.md          # /ham-autocode:status
    pause/SKILL.md           # /ham-autocode:pause
    resume/SKILL.md          # /ham-autocode:resume
  agents/                    # 5 subagent definitions
    planner.md               # Planning agent (Opus)
    coder.md                 # TDD coding agent (Sonnet)
    reviewer.md              # Code review agent (Opus)
    qa-tester.md             # QA testing agent (Sonnet)
    infra.md                 # Infrastructure agent (Sonnet)
  hooks/                     # 3 lifecycle hooks
    hooks.json               # Hook registration
    on-session-start.sh      # Inject pipeline state into new sessions
    on-session-end.sh        # Mark interrupted on crash
    on-post-tool-use.sh      # Track context budget
  core/                      # Node.js Core Engine (zero dependencies)
    index.js                 # CLI dispatcher (30+ commands)
    dag/                     # DAG graph, scheduler, plan parser
    context/                 # Token budget, context manager
    routing/                 # Scorer, router
    executor/                # Adapters for claude-code, codex, claude-app
    validation/              # Gate detector, gate runner
    recovery/                # Checkpoint, worktree manager
    state/                   # Lock, atomic write, config, pipeline, task-graph
    utils/                   # Token estimation, git wrapper
    __tests__/               # 8 test suites
  schemas/                   # JSON Schemas for all state files
  defaults/                  # Default config (harness.json)
  settings.json              # Claude Code settings (enables Agent Teams)
  loop.md                    # /loop default maintenance behavior
```

---

## External Dependencies

ham-autocode orchestrates these framework skill packs (install at least one):

| Dependency | Importance | Used For |
|------------|-----------|----------|
| **GSD** ([get-shit-done](https://github.com/gsd-build/get-shit-done)) | Highly recommended | Phase 2-4: project init, milestones, autonomous execution |
| **gstack** (Garry Tan) | Highly recommended | Phase 1/5/6: idea review, QA, shipping |
| **Superpowers** (Jesse Vincent) | Recommended | Phase 4: TDD execution methodology |

If a dependency is not installed, the corresponding skill calls will fail gracefully -- the pipeline reports the error and moves on.

---

## Windows Notes

1. Agent Teams split-pane mode is not supported on Windows Terminal. Use in-process mode instead.
2. All paths in the Core Engine use forward slashes internally.
3. Hooks use bash (Git Bash on Windows). Ensure Git is installed.

---

## License

MIT - see [LICENSE](LICENSE)
