---
name: status
description: |
  Display the current pipeline progress for ham-autocode.
  Shows which phase is active, what's completed, what's next, and any blockers.
  Reads from .ham-autocode/pipeline.json state file.
  Use when: "progress", "status", "where are we", "show progress",
  "what phase", or when checking pipeline state.
version: 2.0.0
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---

# Pipeline Status Display

Read and display the current ham-autocode pipeline state.

## Protocol

### Step 1: Read State via Core Engine CLI

```bash
# Get pipeline status
node core/index.js pipeline status

# Get DAG statistics
node core/index.js dag status

# Get context budget
node core/index.js context budget

# Get next wave of executable tasks
node core/index.js dag next-wave
```

If pipeline not found, report:
```
Pipeline state not found. Run /ham-autocode:auto to start, or /ham-autocode:detect to analyze existing project.
```

### Step 2: Display Progress

Format output as:

```
== ham-autocode Pipeline Status ==

Project: [name]
Started: [timestamp]
Last Updated: [timestamp]
Current Phase: [phase number] - [phase name]

Phase Progress:
  [x] Phase 1: Initiation ............ DONE (completed at [time])
  [x] Phase 2: Requirements .......... DONE (completed at [time])
  [>] Phase 3: Planning .............. IN PROGRESS (step 2/3: plan-phase)
  [ ] Phase 4: Execution ............. PENDING
  [ ] Phase 5: Review ................ PENDING
  [ ] Phase 6: Ship .................. PENDING

Current Step: Running /gsd:plan-phase for phase 20-core
Blockers: [none or list]
Next: /plan-eng-review to validate architecture

Can interrupt: /ham-autocode:pause
Can resume:    /ham-autocode:resume
```

### Step 3: Show Recent Activity

If pipeline.json has a `log` array, show the last 5 entries:

```
Recent Activity:
  [10:23] Phase 1 completed - office-hours + ceo-review done
  [10:45] Phase 2 completed - PROJECT.md + ROADMAP.md generated
  [11:02] Phase 3 started - discuss-phase for 10-setup
  [11:15] Phase 3 step 1 done - PLAN.md created for 10-setup
  [11:20] Phase 3 step 2 started - discuss-phase for 20-core
```
