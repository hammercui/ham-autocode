---
name: auto
description: |
  Full autonomous development pipeline with state tracking. Runs project through
  6 phases: initiation, requirements, planning, execution, review, and ship.
  Automatically detects project state, skips completed phases, persists progress
  to .ham-autocode/pipeline.json, and supports pause/resume.
  Use when: "auto develop", "full pipeline", "build this project",
  "run the full workflow", or "autonomous mode".
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
  - WebSearch
  - WebFetch
  - AskUserQuestion
---

# Full Autonomous Development Pipeline

You are running the complete development lifecycle for a project.
Three-layer framework: **gstack thinks, GSD stabilizes, Superpowers executes.**

## CRITICAL: State Management via Core Engine CLI

Every step MUST use the v2 core engine CLI for state management. This is non-negotiable.

### Initialize State

```bash
node core/index.js pipeline init "[project-name]"
```

### Update State (BEFORE and AFTER every action)

Before starting a step:
```bash
node core/index.js pipeline log "started [description]"
```

After completing a step:
```bash
node core/index.js pipeline log "completed [description]"
```

### Check DAG Progress
```bash
node core/index.js dag status    # overall stats
node core/index.js dag next      # next executable wave
node core/index.js context budget # context budget status
```

### Route Tasks
```bash
node core/index.js route all     # route all pending tasks
node core/index.js route task <task-id>  # route single task
```

### Validate Changes
```bash
node core/index.js validate run  # run all detected gates
```

This ensures:
1. `/ham-autocode:status` always shows real-time progress
2. `/ham-autocode:pause` knows exactly where to stop
3. `/ham-autocode:resume` knows exactly where to continue
4. If session crashes, state file tells you where it was

---

## Step 0: Detect or Resume

Check if `.ham-autocode/pipeline.json` exists:

- **Exists with status "paused"**: This is a resume. Show what was paused, ask user
  to confirm resume, then jump to the saved position.
- **Exists with status "running" or "interrupted"**: Previous session crashed.
  The SessionEnd hook auto-marked it as "interrupted". Run `/ham-autocode:detect`
  to verify actual file state, reconcile with pipeline.json, and continue from
  the last verified completed phase.
- **Doesn't exist**: Fresh start. Run `/ham-autocode:detect` to check if project
  already has progress. Initialize pipeline.json marking completed phases as "done".

---

## Phase 1: Project Initiation (gstack)

> Skip if: product definition, competitive analysis, and design decisions exist.
> Update pipeline.json: phase 1 status → "running"

1. Run `/office-hours` — validate the idea with 6 forcing questions
2. Run `/plan-ceo-review` — challenge premises, expand/reduce scope
3. Save outputs for Phase 2

> Update pipeline.json: phase 1 status → "done"
> Report: "Phase 1 complete. Product direction established."

---

## Phase 2: Requirements & Milestones (GSD)

> Skip if: PROJECT.md, milestone plans, and WBS exist (or equivalents).
> Update pipeline.json: phase 2 status → "running"

1. Run `/gsd:new-project` — initialize with deep context gathering
2. Run `/gsd:new-milestone` — create milestone and roadmap
3. Confirm PROJECT.md and ROADMAP.md are generated
4. If project has existing docs but no GSD state, acknowledge them as equivalent

> Update pipeline.json: phase 2 status → "done"
> Report: "Phase 2 complete. [N] milestones, [M] phases planned."

---

## Phase 3: Phase Planning (GSD + gstack)

> Skip if: detailed PLAN.md or equivalent technical plans exist per phase.
> Update pipeline.json: phase 3 status → "running"

For each phase in the roadmap:
1. Update pipeline.json: `current_step` → "discuss-phase for [phase-name]"
2. Run `/gsd:discuss-phase --auto` (skip interactive questions)
3. Update pipeline.json: `current_step` → "plan-phase for [phase-name]"
4. Run `/gsd:plan-phase` — create detailed PLAN.md
5. Run `/plan-eng-review` — validate architecture

> Update pipeline.json: phase 3 status → "done"
> Report: "Phase 3 complete. [N] phase plans created and reviewed."

---

## Phase 4: Execution

> Update pipeline.json: phase 4 status → "running"

Choose the best mode based on project size:

### For solo/small projects:
```
/gsd:autonomous
```
GSD handles everything: discuss, plan, execute per phase. Fresh context per task.

### For larger projects (ask user):
Create Agent Teams with 3-5 specialized teammates.
Route tasks:
- Complex architecture, multi-file → Claude Code
- Clear requirements (file + interface + acceptance criteria) → Codex
- Each teammate owns distinct files/directories

> Periodically update pipeline.json with execution progress
> Update pipeline.json: phase 4 status → "done"
> Report: "Phase 4 complete. [N] tasks executed, [M] commits made."

---

## Phase 5: Review & QA (gstack + GSD)

> Update pipeline.json: phase 5 status → "running"

1. `/gsd:verify-work` — UAT verification against requirements
2. `/review` — PR-level code review (security, performance, maintainability)
3. `/qa` — systematic QA testing + auto-fix
4. Fix all CRITICAL/HIGH issues before proceeding
5. Report results to user for final decision

> Update pipeline.json: phase 5 status → "done"
> Report: "Phase 5 complete. [N] issues found, [M] fixed, [K] remaining."

---

## Phase 6: Ship (gstack)

> Only proceed after user confirms Phase 5 results.
> Update pipeline.json: phase 6 status → "running"

1. `/ship` — create PR with changelog and version bump
2. `/document-release` — sync all documentation
3. Report final status

> Update pipeline.json: phase 6 status → "done", overall status → "completed"
> Report: "Pipeline complete. PR created, docs updated."

---

## Rules

- **ALWAYS update pipeline.json** before and after every step — this is the #1 rule
- NEVER re-execute completed phases
- At each phase boundary, report progress to user
- For key decisions (scope changes, architecture choices), ask user
- Keep main context at 30-40% usage — delegate heavy work to subagents
- Commit frequently with atomic changes
- If user says "pause" or "stop", immediately run the pause protocol and update pipeline.json
