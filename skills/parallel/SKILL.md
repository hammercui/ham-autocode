---
name: parallel
description: |
  Parallel development using Agent Teams. Creates a team of 3-5 specialized
  Claude Code teammates + routes clear-requirement tasks to Codex.
  Use when: "parallel dev", "agent teams", "team development",
  "multiple agents", or when project has many independent tasks.
  Prerequisite: Phase 1-3 should be complete (use /ham-autocode:detect first).
version: 1.0.0
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

# Parallel Development with Agent Teams + Codex

You are setting up parallel development for a project with multiple independent tasks.

## Prerequisites Check

1. Run `/ham-autocode:detect` if not already done
2. Verify Phase 1-3 are complete (initiation, requirements, planning)
3. If not complete, run `/ham-autocode:auto` first

## Step 1: Task Analysis

Read the project's task list (WBS, PLAN.md, or equivalent):
1. List all pending tasks
2. Classify each task:
   - **Complexity**: architecture-level vs feature-level vs standalone
   - **Requirement clarity**: does it have file paths + interface + acceptance criteria?
   - **Dependencies**: which tasks block others?
   - **File ownership**: which files/directories does each task touch?

## Step 2: Task Routing

### Route to Claude Code Agent Teams:
- Tasks requiring architectural decisions
- Multi-file coordination
- Tasks with unclear or evolving requirements
- Integration work

### Route to Codex:
- ANY task where requirements are clear, specifically:
  - Target file paths are known
  - Interface/function signatures are defined
  - Acceptance criteria are explicit
- Prepare a clear spec for each Codex task:

```
## Codex Task: [task name]
Files to modify: [exact paths]
Interface: [function signatures or API contracts]
Expected behavior: [what it should do]
Acceptance criteria: [how to verify it's done]
Context: [relevant existing code or docs to read first]
```

## Step 3: Create Agent Team

Ask the user how many teammates to create (default: 3-4).

Create the team with:
1. **Meaningful names** reflecting their responsibility (e.g., "frontend-dev", not "worker-1")
2. **Distinct file ownership** — no two teammates edit the same file
3. **Rich spawn prompts** — teammates don't inherit conversation, so include:
   - Project overview
   - Their specific task list (5-6 tasks each)
   - Files they own
   - Coding conventions
   - What "done" looks like
4. **Plan approval required** for complex tasks

Example team creation prompt:
```
Create a [N]-person team for [project]:

1. [name] (using [agent-type] agent type):
   - Owns: [directory/files]
   - Tasks: [list]
   - Uses Superpowers TDD: test first, implement, refactor

2. [name] ...

Rules:
- Each teammate only edits files in their owned directory
- Require plan approval before implementation
- Report completion to team lead
```

## Step 4: Prepare Codex Task Specs

For each task routed to Codex, generate a self-contained spec document.
Present all Codex specs to the user so they can copy-paste them into Codex.

## Step 5: Monitor and Merge

1. Monitor Agent Teams progress
2. When teammates complete, review outputs
3. When Codex tasks come back, integrate into the repo
4. Resolve any conflicts
5. Run integration tests

## Step 6: Agent Teams Recovery (if session interrupted)

Agent Teams cannot resume across sessions (official limitation).
If the session crashes or is paused:

1. The SessionEnd hook marks pipeline.json as "interrupted"
2. On resume, check which tasks were completed (via git log and file state)
3. Resume the lead session with `claude --resume [session-id]`
4. Tell the lead to spawn NEW teammates for remaining tasks
5. Give new teammates the same rich spawn prompts + info about what's already done
6. New teammates pick up uncompleted tasks only

**Key principle:** Teammates are disposable; the task list and git state are the source of truth.
Save task assignments to `.ham-autocode/team-tasks.json` before starting so recovery
knows what was assigned and what's done.

## Rules

- 5-6 tasks per teammate (not too granular, not too broad)
- No file overlap between teammates
- Codex gets FULL specs — don't assume it has project context
- Save team task assignments to `.ham-autocode/team-tasks.json`
- After all parallel work completes, run `/review` and `/qa`
