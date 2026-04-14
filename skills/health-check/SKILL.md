---
name: health-check
description: |
  Run automated health assessment on the target project.
  Checks: git status, TypeScript compilation (multi-tsconfig),
  test execution, dependency audit, and lint.
  Outputs composite score 0-100 with per-check breakdown.
  Use when: "health check", "project health", "is the project healthy",
  "compilation status", "run all checks", or at the start of any new session.
version: 3.2.0
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

> **CLI alias used below:** `ham-cli` = `HAM_PROJECT_DIR="$PWD" node "${CLAUDE_PLUGIN_ROOT:-$PWD}/dist/index.js"`

# Project Health Check

Automated health assessment for the target project.

## Step 1: Full Health Check

```bash
ham-cli health check
```

This runs 5 checks with weighted scoring:

| Check | Weight | What it does |
|-------|--------|-------------|
| Git Status | 15% | Uncommitted changes, untracked files |
| TypeScript | 25% | All tsconfig*.json compilation (multi-config support) |
| Tests | 25% | Auto-detect and run test suite |
| Dependencies | 15% | npm audit for vulnerabilities |
| Lint | 20% | ESLint or Biome if configured |

## Step 2: Review Score

Interpret the composite score:

| Grade | Score | Action |
|-------|-------|--------|
| A | 90-100 | Ready to ship |
| B | 75-89 | Minor issues, fix before shipping |
| C | 60-74 | Significant issues, fix required |
| D | 40-59 | Major problems, stop and fix |
| F | 0-39 | Critical state, immediate attention |

## Step 3: Additional Checks (if needed)

### ESM/CJS Compatibility
```bash
ham-cli health esm-cjs
```
For Electron or dual-module projects.

### Document-Code Drift
```bash
ham-cli health drift
```
Finds TODO docs that say "pending" but code shows "fixed".

### Uncommitted Code Analysis
```bash
ham-cli health uncommitted
```
Generates change summaries, risk assessment, commit split suggestions.

### Quick Check (git + compile only)
```bash
ham-cli health quick
```

## Rules

- Run `health check` at the start of every new session
- Run `health quick` before any commit
- Fix all Grade D/F issues before proceeding with feature work
- For Electron projects, always run `health esm-cjs`
