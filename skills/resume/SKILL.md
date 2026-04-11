---
name: resume
description: |
  Resume a paused ham-autocode pipeline. Reads pipeline.json to determine
  exact position, then continues execution from that point.
  Use when: "resume", "continue", "pick up", "where was I",
  "restart pipeline", or after a break.
version: 1.0.0
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

# Resume Pipeline

Resume the ham-autocode pipeline from its last saved state.

## Protocol

### Step 1: Read State

Read `.ham-autocode/pipeline.json`.

If not found:
```
No saved pipeline state found.
Options:
  /ham-autocode:detect  — analyze existing project and determine where to start
  /ham-autocode:auto    — start fresh pipeline
```

If status is "running" or "completed":
```
Pipeline status is [status]. No resume needed.
Use /ham-autocode:status to see current state.
```

If status is "interrupted" (session crashed while running):
```
Pipeline was interrupted at Phase [X], step: [step].
This usually means the previous session ended unexpectedly.
Resuming from the interrupted position...
```
Handle "interrupted" exactly like "paused" — read the saved position and continue.

### Step 2: Display Resume Context

Show the user what was happening:

```
== Resuming Pipeline ==

Paused at: [timestamp]
Phase: [X] - [name]
Last completed: [action]
Next action: [what to do]

Resuming now...
```

### Step 3: Update State

Set status to `"running"`, update `resumed_at` timestamp.

Write to `.ham-autocode/pipeline.json`.

### Step 4: Also Resume GSD

If GSD was active, run `/gsd:resume-work` to restore GSD context.

### Step 5: Continue Execution

Execute the `next_action` from the saved state. Then continue the normal
ham-autocode:auto pipeline flow from that point forward.

The key phases and their resume behavior:

| Phase | Resume Action |
|-------|-------------|
| Phase 1 | Re-run the specific step that was interrupted |
| Phase 2 | Check if GSD state exists, continue from there |
| Phase 3 | Continue planning from the specific sub-phase |
| Phase 4 | `/gsd:resume-work` or re-create Agent Teams |
| Phase 5 | Continue review from the specific check |
| Phase 6 | Continue ship from the specific step |

### Step 6: Log

Append to pipeline.json log:
```
{"time": "[now]", "action": "resumed", "from_phase": X, "step": "[description]"}
```
