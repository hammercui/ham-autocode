# ham-autocode Progress Checkpoint

> Updated: 2026-04-14 | Synced to v3.5.0

## Current Version: v3.5.0 (100% Harness + Knowledge Compounding + Token Optimization)

### Version History
| Version | Date | Theme | Harness % |
|---------|------|-------|-----------|
| v1.0.0 | 2026-04-10 | Pure skill orchestration concept | — |
| v1.1.0 | 2026-04-11 | Plugin structure + pipeline state | — |
| v2.0.0 | 2026-04-11 | JS Core Engine (DAG/Context/Routing/Validation/Recovery) | 83% |
| v2.1.0 | 2026-04-13 | TypeScript migration + all gap fixes | 92% |
| v2.2.0 | 2026-04-13 | Observability + Auto-commit + Agent Teams + Guardrails | 97% |
| v2.3.0 | 2026-04-13 | OpenSpec spec-driven routing | 99% |
| v3.0.0 | 2026-04-13 | CE Knowledge Compounding (learning/adapter/patterns) | 100% |
| v3.1.0 | 2026-04-13 | Token Saving + Memory + PM Methods + OpenCode + Research | 100% |
| v3.2.0 | 2026-04-14 | Field-Tested Improvements (Health/Drift/ESM-CJS) | 100% |
| v3.3.0 | 2026-04-14 | Token Optimization 40-60% (split index, slim skills) | 100% |
| v3.4.0 | 2026-04-14 | Memory ROI Fix + LSP-First Rule | 100% |
| v3.5.0 | 2026-04-14 | Memory Progressive Disclosure + CI + Docs | 100% |

### What's Built
- **45+ CLI commands** via `node dist/index.js`
- **35+ TypeScript core modules** in `core/`
- **10 Skills**: detect, status, pause, resume, ship, auto, parallel, setup, health-check, research
- **5 Agents**: planner, coder, reviewer, qa-tester, infra
- **5 Routing Targets**: Claude Code, Codex, Claude App, Agent Teams, OpenCode
- **3 Hooks**: SessionStart, SessionEnd, PostToolUse
- **8 Guardrail Rules**: R01-R08
- **8 Unit test suites** — all passing
- **GitHub Actions CI**: Node 18+22 matrix
- **Dependencies**: gstack (69 skills) + GSD (73 commands) + Superpowers (14 skills)

### Key Capabilities by Layer

**Core Engine (v2.x)**
- DAG scheduler (topo sort, wave-based parallel, cycle detection)
- Context engine (token budget, selective loading, three-level protection)
- Agent router (5-target scoring: spec/complexity/isolation)
- Validation gates (auto-detect lint/typecheck/test, two-strike-out)
- Recovery engine (git tag checkpoint + worktree isolation)
- Atomic state management (file-lock, atomic JSON write)

**Knowledge Compounding (v3.0)**
- Learning analyzer: trace + history → insights (routing accuracy, failure patterns, token costs)
- Learning adapter: threshold adaptation with history tracking
- Pattern memory: cross-session project patterns (file structure, task types, risky files)

**Token Optimization (v3.1-v3.3)**
- Split index.ts: 756→85 line dispatcher + 8 command modules
- Slim skills: total 980→679 lines (-31%)
- PostToolUse fast exit: shell-level budget check, 99% skip Node
- Subagent context templates: per-target minimal context (1K-5K vs 10-20K tokens)
- SessionStart single call: 3 Node calls → 1
- File summary cache, incremental context, TF-IDF search

**Memory System (v3.4-v3.5)**
- Progressive disclosure: compact brain index (~150 tokens), `learn detail <topic>` for full
- PostToolUse observation capture → file co-occurrence analysis
- Memory decay: painPoints/patterns auto-expire after 30 tasks
- Memory guard: post-task quality check (duplicates, TODO/FIXME, long files)

**Health & Quality (v3.2)**
- 5-check health assessment (git/compile/test/deps/lint), composite score 0-100
- Document-code drift detection
- Uncommitted code analyzer with commit split suggestions
- ESM/CJS compatibility detector
- Field-test feedback loop

### Verification Status: COMPLETE
- 21 E2E self-test scenarios ✅
- ham-video: 33 tasks parsed, full lifecycle simulated ✅
- ham-video: real code fix (fix-js-ext, 5 files committed) ✅
- 8 unit test suites: all passing ✅
- All 10 skills verified via `claude -p --plugin-dir` ✅
- All 3 hooks verified in real Claude Code sessions ✅
- GitHub Actions CI: Node 18+22 matrix ✅

### Bugs Found & Fixed (13 total)
1. Parser only matched `### Task N:` → added `##`/`####`/checkbox/table formats
2. Pipeline.log not auto-appending → added to complete/fail/skip/init
3. `npm test` pointed to nonexistent file → created run-all.js
4. Rollback crashed on renamed files → graceful skip
5. Parser couldn't parse real WBS tables → added 5-column table format
6. Parser didn't extract dependency columns → added blockedBy resolution
7. CLAUDE_PLUGIN_ROOT path issue → fixed all hooks + skills
8. specScore always 30 → 4-dimension scoring
9. Hooks used $CLAUDE_PROJECT_DIR → fixed to $CLAUDE_PLUGIN_ROOT
10. Skills CLI path too long → ham-cli alias
11. paths.ts ESM/CJS compatibility (ham-video field test)
12. orchestrator unused import (ham-video field test)
13. doc-code status drift (ham-video field test)

### Next Steps
1. **ham-video actual development**: use harness for real feature work
2. **v4.0 planning**: identify next evolution direction based on field usage

### Key Files
- `.planning/CHECKPOINT.md` — this file
- `CHANGELOG.md` — full changelog (v1.0-v3.5)
- `ARCHITECTURE.md` — architecture doc
- `GUIDE.md` — 10-minute onboarding tutorial
- `docs/GAP-ANALYSIS.md` — harness gap analysis
