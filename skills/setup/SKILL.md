---
name: setup
description: |
  Auto-detect and install missing dependency skill packs for ham-autocode.
  Checks for gstack, GSD, Superpowers, and OpenSpec (optional), installs any that are missing.
  Use when: "setup", "install dependencies", "install skills",
  "missing skills", or when /ham-autocode:auto fails due to missing skills.
version: 3.0.0
allowed-tools:
  - Bash
  - Read
  - Glob
  - AskUserQuestion
---

> **CLI alias used below:** `ham-cli` = `HAM_PROJECT_DIR="$PWD" node "${CLAUDE_PLUGIN_ROOT:-$PWD}/dist/index.js"`

# ham-autocode Setup — Dependency Installation

Automatically detect and install missing skill packs that ham-autocode depends on.

## Step 1: Detect Installed Skills

Check which dependency skill packs are already installed:

```bash
# Check GSD
ls ~/.claude/plugins/gsd*/skills/*/SKILL.md 2>/dev/null || ls ~/.claude/skills/gsd*/SKILL.md 2>/dev/null || echo "GSD: NOT FOUND"

# Check gstack
ls ~/.claude/skills/gstack/skills/*/SKILL.md 2>/dev/null || echo "gstack: NOT FOUND"

# Check Superpowers
ls ~/.claude/plugins/superpowers*/skills/*/SKILL.md 2>/dev/null || ls ~/.claude/skills/superpowers*/SKILL.md 2>/dev/null || echo "Superpowers: NOT FOUND"

# Check OpenSpec (optional)
ls ~/.claude/plugins/openspec*/SKILL.md 2>/dev/null || ls ~/.claude/skills/openspec*/SKILL.md 2>/dev/null || echo "OpenSpec: NOT FOUND (optional)"
```

## Step 2: Report Status

Show the user which skill packs are installed and which are missing:

```
== ham-autocode Dependency Status ==

| Skill Pack   | Status    | Used For                    | Importance       |
|-------------|-----------|-----------------------------| -----------------|
| gstack       | ✅ / ❌  | Phase 1/5/6: review, QA, ship | Highly recommended |
| GSD          | ✅ / ❌  | Phase 2-4: project, milestones, autonomous | Highly recommended |
| Superpowers  | ✅ / ❌  | Phase 4: TDD execution      | Recommended      |
| OpenSpec     | ✅ / ❌  | Spec-driven routing, task scoring | Optional         |
```

## Step 3: Install Missing (with user confirmation)

For each missing skill pack, ask the user to confirm, then install:

### gstack (Garry Tan)
```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && chmod +x setup && ./setup
```

### GSD (Get Shit Done)
```bash
# Via marketplace (preferred)
# Run in Claude Code: /plugin marketplace add gsd-build/get-shit-done
# Then: /plugin install gsd@gsd-build

# Via git clone (fallback)
git clone --single-branch --depth 1 https://github.com/gsd-build/get-shit-done.git ~/.claude/plugins/gsd
```

### Superpowers (Jesse Vincent / obra)
```bash
# Via marketplace (preferred)
# Run in Claude Code: /plugin marketplace add obra/superpowers-marketplace
# Then: /plugin install superpowers@superpowers-marketplace

# Via git clone (fallback)
git clone --single-branch --depth 1 https://github.com/obra/superpowers.git ~/.claude/plugins/superpowers
```

### OpenSpec (Fission-AI) — Optional
```bash
git clone --single-branch --depth 1 https://github.com/Fission-AI/OpenSpec.git ~/.claude/plugins/openspec
```

## Step 4: Verify

After installation, verify all skills are available:

```bash
# Verify gstack
ls ~/.claude/skills/gstack/skills/*/SKILL.md 2>/dev/null | wc -l

# Verify GSD
ls ~/.claude/plugins/gsd*/skills/*/SKILL.md 2>/dev/null | wc -l

# Verify Superpowers
ls ~/.claude/plugins/superpowers*/skills/*/SKILL.md 2>/dev/null | wc -l
```

Report final status to user. Suggest `/reload-plugins` if any were installed.

## Rules

- ALWAYS ask user confirmation before installing each skill pack
- Use git clone as primary method (most reliable)
- If clone fails (network/permission), suggest manual installation
- Do NOT install if already present
- After installation, remind user to run `/reload-plugins`
