---
name: status
description: |
  Extends /gsd:progress with ham-autocode DAG/pipeline state.
  Shows phase, DAG stats, budget, blockers, recent activity.
  Use when: "status", "progress", "where are we", "pause", "stop", "break".
version: 4.0.0
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

> `ham-cli` = `HAM_PROJECT_DIR="$PWD" node "${CLAUDE_PLUGIN_ROOT:-$PWD}/dist/index.js"`

# Pipeline Status / Pause

## Show Status

```bash
ham-cli pipeline status
ham-cli dag status
ham-cli dag next-wave
ham-cli context budget
```

No pipeline? → `/ham-autocode:auto` or `/ham-autocode:detect`.

Display: project, phase progress (done/in-progress/pending), current step, blockers, last 5 log entries.

## Pause Pipeline

If user says "pause"/"stop"/"break":

```bash
ham-cli pipeline log "paused at Phase [X], step: [description]"
ham-cli pipeline pause
```

Save to pipeline.json: current_step, last_completed, next_action, resume_instructions.
If Agent Teams active: list them, request shutdown, note incomplete tasks.
If GSD active: `/gsd:pause-work`.

Confirm: "Pipeline paused. Resume: `/ham-autocode:resume`"
