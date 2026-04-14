---
name: auto
description: |
  Full autonomous development pipeline. 6 phases: initiation, requirements,
  planning, execution, review, ship. Auto-detects state, skips completed phases.
  Use when: "auto develop", "full pipeline", "build this project".
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
  - WebSearch
  - WebFetch
  - AskUserQuestion
---

> `ham-cli` = `HAM_PROJECT_DIR="$PWD" node "${CLAUDE_PLUGIN_ROOT:-$PWD}/dist/index.js"`

# Autonomous Pipeline

Framework: **gstack thinks, GSD stabilizes, Superpowers executes.**

## State Management (mandatory)

```bash
ham-cli pipeline init "[name]"       # start
ham-cli pipeline log "[action]"      # before/after every step
ham-cli dag status                   # progress
ham-cli dag next-wave                # next tasks
ham-cli route batch                  # route all
ham-cli validate <task-id>           # run gates
```

## Step 0: Detect or Resume

- **pipeline.json exists + paused**: resume from saved position
- **pipeline.json exists + interrupted**: run `/ham-autocode:detect`, continue from last verified phase
- **No pipeline.json**: fresh start, run `/ham-autocode:detect`

## Phase 1: Initiation (gstack)

Skip if product definition exists. Run `/office-hours` then `/plan-ceo-review`.

## Phase 2: Requirements (GSD)

Skip if PROJECT.md + WBS exist. Run `/gsd:new-project` then `/gsd:new-milestone`.

## Phase 3: Planning (GSD + gstack)

Skip if PLAN.md exists per phase. For each phase:
`/gsd:discuss-phase --auto` then `/gsd:plan-phase` then `/plan-eng-review`.

## Phase 4: Execution

Solo: `/gsd:autonomous`. Larger: Agent Teams with file ownership.
Route: complex → Claude Code, clear spec → Codex, simple → OpenCode.

## Phase 5: Review & QA

`/gsd:verify-work` → `/review` → `/qa`. Fix CRITICAL/HIGH before proceeding.

## Phase 6: Ship

Only after user confirms Phase 5. `/ship` → `/document-release`.

## Rules

- ALWAYS update pipeline.json before/after every step
- NEVER re-execute completed phases
- Report progress at phase boundaries
- Main context 30-40% — delegate to subagents
- "pause"/"stop" → immediately run pause protocol
