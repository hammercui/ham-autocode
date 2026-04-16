---
name: ship
description: |
  Wrapper over gstack /ship + /review + /qa + /gsd:verify-work.
  Adds ham-autocode validation gates before community skill handoff.
  Use when: "review and ship", "QA and deploy", "code is ready".
version: 4.0.0
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

> `ham-cli` = `HAM_PROJECT_DIR="$PWD" node "${CLAUDE_PLUGIN_ROOT:-$PWD}/dist/index.js"`

# Review, QA & Ship

## 1. Validation Gates

```bash
ham-cli validate detect          # available gates
ham-cli validate <task-id>       # run per task
ham-cli dag status               # completion check
```

Two-strike policy: retry once on failure.

## 2. Verification

GSD: `/gsd:verify-work`. Otherwise: manually check acceptance criteria.

## 3. Code Review

`/review` — security, performance, test coverage, architecture.

## 4. QA Testing

`/qa` — functional + regression tests. Auto-fix bugs (atomic commits).
Re-validate after fixes: `ham-cli validate <task-id>`

## 5. Ship

Only after CRITICAL/HIGH resolved + user confirmation.
1. `/ship` — VERSION bump, CHANGELOG, PR
2. `/document-release` — sync docs
3. `ham-cli pipeline log "shipped"`

## Rules

- NEVER ship with unresolved CRITICAL/HIGH issues
- Always ask user confirmation before PR
- Each bug fix is an atomic commit
