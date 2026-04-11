---
name: pause
description: |
  Pause the ham-autocode pipeline. Saves current state to pipeline.json
  with exact position (phase, step, context). Can be resumed later with
  /ham-autocode:resume. Use when: "pause", "stop", "break", "interrupt",
  "save and stop", or when user needs to step away.
version: 2.0.0
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Pause Pipeline

Save the current pipeline state and stop execution gracefully.

## Protocol

### Step 1: Read Current State via Core Engine

```bash
node core/index.js pipeline status
node core/index.js dag status
```

### Step 2: Update State

Set the current phase status to `"paused"` and record:
- Exact position (which phase, which step within the phase)
- What was the last completed action
- What should happen next when resumed
- Current timestamp
- Any in-progress Agent Teams (note their names for cleanup)

IMPORTANT: Do NOT replace the entire pipeline.json. Only UPDATE the following fields
while preserving all existing fields (especially `phases`, `log`, `project`, `started_at`):

```
status → "paused"
paused_at → current ISO timestamp
current_step → current step description
last_completed → what was last done
next_action → what to do on resume
resume_instructions → human-readable resume guide
active_agent_teams → list of teammate names (or empty)
```

Also log via core engine:
```bash
node core/index.js pipeline log "paused at Phase [X], step: [description]"
```

See `schemas/pipeline.schema.json` for the complete schema.

### Step 3: Cleanup

If Agent Teams are running:
1. List active teammates
2. Request graceful shutdown for each
3. Note incomplete tasks in pipeline.json

### Step 4: Also Save GSD State

If GSD is initialized, run `/gsd:pause-work` to save GSD-level state too.

### Step 5: Confirm

Output:
```
Pipeline paused at Phase [X], step: [description].
State saved to .ham-autocode/pipeline.json

To resume: /ham-autocode:resume
To check status: /ham-autocode:status
```
