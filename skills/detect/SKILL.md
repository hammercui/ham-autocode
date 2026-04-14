---
name: detect
description: |
  Detect current project state. Scans files, git, docs to determine
  which phases are complete. Prevents re-executing completed work.
  Use when: "detect state", "project status", "where are we".
version: 3.3.0
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---

> `ham-cli` = `HAM_PROJECT_DIR="$PWD" node "${CLAUDE_PLUGIN_ROOT:-$PWD}/dist/index.js"`

# Project State Detection

Scan systematically, report factually, recommend next action.

## Step 1: Scan Structure

- `ls` project root, check: CLAUDE.md, PROJECT.md, docs/, .planning/, src/, tests/
- `git log --oneline -20`, `git status`

## Step 2: Check Each Phase

| Phase | Look for |
|-------|----------|
| 1 Initiation | design docs, product definition, competitive analysis |
| 2 Requirements | PROJECT.md, WBS, .planning/, milestone plans |
| 3 Planning | PLAN.md per phase, architecture docs, task breakdowns |
| 4 Execution | Source code, feat/fix commits, test code |
| 5 Review | Code review records, QA results, VERIFICATION.md |
| 6 Release | PRs, CHANGELOG, git tags, deploy records |

## Step 3: Output Diagnosis

```
## Project State: [name]
### Overall: Phase [X] ([percentage]%)
| Phase | Status | Evidence |
|-------|--------|----------|
| 1-6   | Done/Partial/Not Started | key files |

### Recommended Next Steps:
1. [action + skill command]
```

## Step 4: Route via CLI

```bash
ham-cli dag init <plan-file>    # parse tasks
ham-cli route batch             # route all
ham-cli dag status              # check progress
```

## Rules

- NEVER recommend re-executing completed phases
- Equivalent docs count (e.g., `docs/06-WBS.md` = GSD ROADMAP)
- Cite actual file names and git commits as evidence
