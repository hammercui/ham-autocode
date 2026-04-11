---
name: parallel
description: |
  Parallel development using Agent Teams + core engine routing. Uses DAG
  scheduler for task waves, scorer for routing (Claude Code vs Codex vs App),
  and context budget for resource management.
  Use when: "parallel dev", "agent teams", "team development",
  "multiple agents", or when project has many independent tasks.
  Prerequisite: Phase 1-3 should be complete (use /ham-autocode:detect first).
version: 2.0.0
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

# Parallel Development with Agent Teams + Core Engine (v2.0)

You are setting up parallel development using the DAG scheduler and agent routing engine.

## Prerequisites Check

1. Run `/ham-autocode:detect` if not already done
2. Verify Phase 1-3 are complete

## Step 1: Parse and Score Tasks

```bash
# Parse plan into task objects
node core/index.js dag init .planning/phases/*/PLAN.md

# Score and route all tasks
node core/index.js route batch

# Check what's ready to execute
node core/index.js dag next-wave

# Verify context budget
node core/index.js context budget
```

## Step 2: Task Routing via Core Engine

The router scores each task on 3 dimensions:
- **specScore** (0-100): How complete is the spec?
- **complexityScore** (0-100): How many files/dependencies?
- **isolationScore** (0-100): How much file overlap with other tasks?

Routing rules:
- High spec + high isolation → **Codex** (clear, independent work)
- Low complexity + decent spec → **Claude App** (trivial tasks)
- Everything else → **Claude Code** (complex, architectural)

```bash
# See routing decisions
node core/index.js route batch
```

## Step 3: Create Agent Team for Claude Code Tasks

Ask the user how many teammates (default: 3-4).

Create team with:
1. **Meaningful names** (e.g., "frontend-dev", "api-dev")
2. **Distinct file ownership** — no two teammates edit the same file
3. **Rich spawn prompts** — include project overview, task list, conventions
4. **Plan approval** for complex tasks

## Step 4: Prepare Codex Task Specs

For each task routed to Codex, use the executor adapter:
```bash
# The core engine generates structured specs
node core/index.js route [task-id]
```

Present specs to user for Codex execution.

## Step 5: Execute with DAG Waves

```bash
# Get current wave
node core/index.js dag next-wave

# After completing tasks, update status
node core/index.js dag complete <task-id>

# Check progress
node core/index.js dag status
```

## Step 6: Validation and Recovery

After each task completion:
```bash
# Run validation gates
node core/index.js validate <task-id>

# If validation fails, use recovery
node core/index.js recover checkpoint <task-id>
node core/index.js recover rollback <task-id>
```

## Step 7: Monitor and Merge

1. Monitor Agent Teams progress
2. Integrate Codex outputs
3. Run `node core/index.js validate <task-id>` after integration
4. Continue with next DAG wave

## Rules

- Use `node core/index.js dag next-wave` to determine task execution order
- Use `node core/index.js route batch` for routing decisions
- Check `node core/index.js context budget` before heavy operations
- Create checkpoints before risky tasks
- 5-6 tasks per teammate, no file overlap
- Save team assignments to pipeline state for recovery
