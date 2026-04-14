---
name: setup
description: |
  Auto-detect and install missing dependency skill packs.
  Use when: "setup", "install dependencies", "missing skills".
version: 3.3.0
allowed-tools:
  - Bash
  - Read
  - Glob
  - AskUserQuestion
---

# ham-autocode Setup

## Step 1: Detect

```bash
ls ~/.claude/skills/gstack/skills/*/SKILL.md 2>/dev/null | wc -l      # gstack
ls ~/.claude/plugins/gsd*/skills/*/SKILL.md 2>/dev/null | wc -l       # GSD
ls ~/.claude/plugins/superpowers*/skills/*/SKILL.md 2>/dev/null | wc -l # Superpowers
```

## Step 2: Install Missing (confirm each)

| Pack | Install | Importance |
|------|---------|-----------|
| gstack | `git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && chmod +x setup && ./setup` | High |
| GSD | `git clone --depth 1 https://github.com/gsd-build/get-shit-done.git ~/.claude/plugins/gsd` | High |
| Superpowers | `git clone --depth 1 https://github.com/obra/superpowers.git ~/.claude/plugins/superpowers` | Medium |

## Rules

- ALWAYS ask user confirmation before installing
- Do NOT install if already present
- After install, remind to `/reload-plugins`
