---
name: ship
description: |
  Review, QA, and ship workflow using v2.0 core engine. Runs validation gates,
  code review, systematic QA, then creates PR and updates documentation.
  Uses core engine for validation, recovery, and state management.
  Use when: "review and ship", "QA and deploy", "code is ready",
  "check and release", or after development execution completes.
version: 2.0.0
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

> **CLI alias used below:** `ham-cli` = `HAM_PROJECT_DIR="$PWD" node "${CLAUDE_PLUGIN_ROOT:-$PWD}/dist/index.js"`
# Review, QA & Ship Pipeline (v2.0)

You are running the complete review-to-release pipeline with core engine support.

## Phase 1: Validation Gates

```bash
# Detect available validation gates
ham-cli validate detect

# Run validation per task (repeat for each task)
ham-cli validate <task-id>

# Check DAG completion
ham-cli dag status
```

All gates must pass before proceeding. Two-strike policy: retry once on failure.

## Phase 2: Verification

1. If GSD is initialized: run `/gsd:verify-work` for UAT verification
2. If not: manually check task completion against requirements
3. List all acceptance criteria and their pass/fail status

## Phase 3: Milestone Audit

1. If GSD: run `/gsd:audit-milestone`
2. Compare completed work against milestone acceptance criteria
3. Identify gaps

## Phase 4: Code Review

Run `/review` (gstack) for PR-level review:
- Security implications
- Performance impact
- Test coverage
- Architecture compliance

## Phase 5: QA Testing

Run `/qa` (gstack) for systematic testing:
- Functional, integration, and regression tests
- Auto-fix discovered bugs (atomic commits per fix)
- Re-run validation after fixes: `ham-cli validate <task-id>`

## Phase 6: Triage Issues

| Severity | Action |
|----------|--------|
| CRITICAL | Fix immediately — create checkpoint first |
| HIGH | Fix immediately |
| MEDIUM | Create task, fix if time permits |
| LOW | Record to backlog |

For fixes, use recovery:
```bash
ham-cli recover checkpoint <task-id>
# ... make fix ...
ham-cli validate <task-id>
```

## Phase 7: Ship

> Only after all CRITICAL/HIGH issues are resolved.

1. Ask user for confirmation
2. Run `/ship` (gstack) — VERSION bump, CHANGELOG, PR
3. Run `/document-release` — sync docs
4. Update pipeline: `ham-cli pipeline log "shipped"`

## Rules

- NEVER ship with unresolved CRITICAL/HIGH issues
- Always ask user confirmation before creating PR
- Use core engine validation gates as final check
- Create checkpoints before risky fixes
- Each bug fix is an atomic commit
