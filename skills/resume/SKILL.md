---
name: resume
description: |
  Resume a paused ham-autocode pipeline. Uses core engine CLI to read
  pipeline state, DAG progress, and context budget, then continues
  execution from the saved position.
  Use when: "resume", "continue", "pick up", "where was I",
  "restart pipeline", or after a break.
version: 2.0.0
benefits-from:
  - status
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - Skill
  - WebSearch
  - WebFetch
  - AskUserQuestion
---

# Resume Pipeline (v2.0)

Resume the ham-autocode pipeline from its last saved state using core engine.

## Protocol

### Step 1: Read State via Core Engine

```bash
node core/index.js pipeline status
node core/index.js dag status
node core/index.js dag next
node core/index.js context budget
```

If no pipeline found:
```
No saved pipeline state found.
Options:
  /ham-autocode:detect  — analyze existing project
  /ham-autocode:auto    — start fresh pipeline
```

If status is "running" or "completed":
```
Pipeline status is [status]. No resume needed.
Use /ham-autocode:status to see current state.
```

### Step 2: Display Resume Context

```
== Resuming Pipeline (v2.0) ==

Paused at: [timestamp]
Phase: [X] - [name]
Last completed: [action]
Next action: [what to do]

DAG Progress: [done]/[total] tasks
Context Budget: [level] ([pct]%)
Next Wave: [ready tasks]

Resuming now...
```

### Step 3: Update State

```bash
node core/index.js pipeline log "resumed from paused state"
```

Update pipeline.json: set `status` → `"running"`, `resumed_at` → now.

### Step 4: Also Resume GSD

If GSD was active, run `/gsd:resume-work` to restore GSD context.

### Step 5: Continue Execution

Use DAG scheduler to determine next tasks:
```bash
node core/index.js dag next
```

Route and execute the next wave, following the normal auto pipeline flow.

### Step 6: Recovery for Agent Teams

If Agent Teams were active before pause:
1. Read team assignments from pipeline state
2. Spawn NEW teammates for remaining tasks
3. Give rich context including what's already done
4. Agent Teams are disposable — git state is source of truth
