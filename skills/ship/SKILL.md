---
name: ship
description: |
  Review, QA, and ship workflow. Runs code review, systematic QA testing,
  auto-fixes issues, then creates PR and updates documentation.
  Use when: "review and ship", "QA and deploy", "code is ready",
  "check and release", or after development execution completes.
version: 1.0.0
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

# Review, QA & Ship Pipeline

You are running the complete review-to-release pipeline.

## Phase 1: Verification

1. If GSD is initialized: run `/gsd:verify-work` for UAT verification
2. If not: manually check task completion against WBS/requirements docs
3. List all acceptance criteria and their pass/fail status

## Phase 2: Milestone Audit

1. If GSD: run `/gsd:audit-milestone`
2. If not: compare completed work against milestone acceptance criteria
3. Identify any gaps between what was planned and what was delivered

## Phase 3: Code Review

Run `/review` (gstack) for PR-level review:
- Security implications
- Performance impact
- Test coverage
- Architecture compliance

## Phase 4: QA Testing

Run `/qa` (gstack) for systematic testing:
- Functional tests
- Integration tests
- Regression tests
- Auto-fix discovered bugs (atomic commits per fix)

## Phase 5: Triage Issues

Categorize all discovered issues:

| Severity | Action |
|----------|--------|
| CRITICAL | Fix immediately before proceeding |
| HIGH | Fix immediately before proceeding |
| MEDIUM | Create task, fix if time permits |
| LOW | Record to backlog |

Route fixes:
- Complex fixes → Claude Code
- Clear-requirement fixes → Codex (provide file + expected behavior + acceptance criteria)

## Phase 6: Design Review (if UI exists)

Run `/design-review` (gstack) for visual consistency audit.

## Phase 7: Ship

> Only after all CRITICAL/HIGH issues are resolved.

1. Ask user for confirmation before shipping
2. Run `/ship` (gstack) — merge base, tests, diff review, VERSION bump, CHANGELOG, PR
3. Run `/document-release` — sync docs to match shipped code
4. Report: PR link, changes summary, known remaining issues

## Rules

- NEVER ship with unresolved CRITICAL/HIGH issues
- Always ask user confirmation before creating PR
- Each bug fix is an atomic commit
- Report before/after health scores
