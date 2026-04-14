---
name: resume
description: |
  Resume a paused pipeline. Reads state, displays context, continues execution.
  Use when: "resume", "continue", "pick up", "where was I".
version: 3.3.0
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

> `ham-cli` = `HAM_PROJECT_DIR="$PWD" node "${CLAUDE_PLUGIN_ROOT:-$PWD}/dist/index.js"`

# Resume Pipeline

## Step 1: Read State

```bash
ham-cli pipeline status
ham-cli dag status
ham-cli dag next-wave
ham-cli context budget
```

No pipeline? → `/ham-autocode:detect` or `/ham-autocode:auto`.
Status running/completed? → No resume needed.

## Step 2: Resume

```bash
ham-cli pipeline log "resumed from paused state"
ham-cli pipeline resume
```

If GSD was active: `/gsd:resume-work`.

## Step 3: Continue

```bash
ham-cli dag next-wave    # next tasks
```

Route and execute following normal pipeline flow.
If Agent Teams were active: spawn new teammates for remaining tasks.
