---
name: parallel
description: |
  Parallel development with Agent Teams + DAG routing.
  Use when: "parallel dev", "agent teams", "multiple agents".
  Prerequisite: Phase 1-3 complete.
version: 3.3.0
benefits-from:
  - detect
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - Skill
  - AskUserQuestion
---

> `ham-cli` = `HAM_PROJECT_DIR="$PWD" node "${CLAUDE_PLUGIN_ROOT:-$PWD}/dist/index.js"`

# Parallel Development

## Step 1: Parse and Route

```bash
ham-cli dag init .planning/phases/*/PLAN.md
ham-cli route batch
ham-cli dag next-wave
ham-cli context budget
```

## Step 2: Routing Rules

- specScore >= 80 + isolationScore >= 70 → **Codex**
- complexityScore <= 20 + files <= 3 → **OpenCode** (free)
- doc/config/hotfix type → **Claude App**
- Default → **Claude Code**

## Step 3: Agent Teams (Claude Code tasks)

Create 3-4 teammates with:
- Meaningful names (e.g., "frontend-dev")
- Distinct file ownership — no overlap
- Rich spawn prompts with project context

## Step 4: Execute in Waves

```bash
ham-cli dag next-wave            # get wave
ham-cli dag complete <task-id>   # mark done
ham-cli validate <task-id>       # run gates
ham-cli dag status               # check progress
```

## Rules

- 5-6 tasks per teammate, no file overlap
- Check `ham-cli context budget` before heavy ops
- Create checkpoints before risky tasks
