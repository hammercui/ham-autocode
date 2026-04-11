# v2.0 Codex Code Review Issues (25 items)

> Source: Codex GPT-5.4 code review of core/ (32 files, +2342 lines)
> Date: 2026-04-11
> Status: Awaiting fix round 2

## Priority 1: Security (4 issues)

### S1 [BUG] git.js — Command injection via string execSync
- File: `core/utils/git.js:5-14`
- All git operations use `execSync(cmd)` with string interpolation
- taskId/ref/files with quotes or special chars will break or inject
- **Fix:** Replace `execSync(cmd)` with `execFileSync('git', [args...])` array form

### S2 [BUG] task-graph.js — Path traversal via taskId
- File: `core/state/task-graph.js:12`
- `taskId` directly in `path.join(tasksDir, taskId + '.json')`, no `..` validation
- readTask/writeTask/updateTaskStatus all vulnerable
- **Fix:** Validate taskId matches `/^[a-zA-Z0-9_-]+$/` before use

### S3 [BUG] context/manager.js — Path traversal via requiredFiles
- File: `core/context/manager.js:37`
- `task.requiredFiles` joined with projectDir, no root constraint
- **Fix:** Validate resolved path starts with projectDir

### S4 [CONCERN] checkpoint.js + gates.js — Shell exec of untrusted input
- Files: `core/recovery/checkpoint.js:47`, `core/validation/gates.js:14`
- Running shell commands from repo config (package.json scripts)
- **Fix:** Document security boundary; execFileSync for git; accept risk for lint/test (user's own repo)

## Priority 2: CLI Closed-Loop (7 issues)

### C1 [BUG] index.js — Missing 60%+ of designed CLI commands
- File: `core/index.js:37-58`
- Missing: `dag init`, `dag next-wave`, `dag complete`, `dag fail`, `dag retry`, `dag skip`, `dag unblock`
- Missing: `context prepare`
- Missing: `route batch`, `route confirm`
- Missing: `recover checkpoint/rollback/worktree-create/merge/remove`
- Missing: `config validate`
- Missing: `pipeline pause`, `pipeline resume`
- **Fix:** Add all missing commands to the switch/case dispatcher

### C2 [BUG] index.js:171 — validate uses projectDir not taskId
- Design: `validate <task-id>` runs gates for a specific task
- Current: treats first arg as projectDir
- **Fix:** Implement task-level validation via `validateTask()`

### C3 [BUG] dag/parser.js — No write to tasks/ directory
- File: `core/dag/parser.js:17`
- Parser only returns task array, doesn't persist to `.ham-autocode/tasks/`
- `dag init` CLI doesn't call writeTask
- **Fix:** `dag init` should parse + write all tasks to disk

### C4 [BUG] router.js:54 — routeAllTasks doesn't persist
- Returns in-memory objects, doesn't write back to task files
- `route all` CLI only prints, no state update
- **Fix:** `route batch` should score + write routing back to each task file

### C5 [BUG] router.js:29 — Routing rules differ from design
- Design: `doc/config/hotfix -> claude-app`
- Current: `complexityScore < 30 && specScore >= 60 -> claude-app`
- **Fix:** Add task type field check OR align design with implementation

### C6 [BUG] dag/graph.js:11 — Non-existent deps misreported as cycles
- `topoSort()` counts missing dep IDs in inDegree → stuck tasks reported as "cycles"
- **Fix:** Skip blockedBy entries that don't match any task ID

### C7 [BUG] dag/scheduler.js:11 — Missing deps cause silent deadlock
- `nextWave()` blocks forever if blockedBy points to non-existent task
- **Fix:** Treat non-existent deps as resolved (with warning)

## Priority 3: Validation & Recovery (5 issues)

### V1 [BUG] gates.js:43 — 0 gates matched = passed:true
- Empty gate list (filter miss or no detection) returns success
- **Fix:** If requested gates > 0 but matched = 0, return `passed: false` with "gates not found"

### V2 [BUG] gates.js:54 — Two-strike doesn't return to caller
- First failure immediately retries inside the function
- Design: first fail → return error → skill retries with context → second run
- **Fix:** Remove internal retry; let caller manage attempts via task.validation.attempts

### V3 [BUG] worktree.js:16 — Path/branch naming doesn't match design
- Current: `path.dirname(cwd)/.ham-worktrees/<taskId>`, branch `ham-worktree-<taskId>`
- Design: `.ham-autocode/worktrees/<task-id>`, branch `ham-wt-<task-id>`
- **Fix:** Align paths and branch names

### V4 [BUG] worktree.js:44 — removeWorktree partial success = ok:true
- Partial cleanup reported as success
- **Fix:** Track both operations, return ok only if both succeed

### V5 [CONCERN] executor/claude-code.js:38 — Instructs auto-commit
- Instruction says "commit changes"
- Design: "validate + recommend, no auto-commit"
- **Fix:** Change to "report completion, do not commit"

## Priority 4: Concurrency (3 issues)

### CC1 [BUG] pipeline.js:42 — appendLog read outside lock
- `readPipeline()` called before `withLock`, race condition with concurrent writers
- **Fix:** Move read inside `withLock` block

### CC2 [BUG] task-graph.js:38 — updateTaskStatus read outside lock
- Same pattern: read → lock → write. Another writer can interleave
- **Fix:** Move readTask inside `withLock`

### CC3 [CONCERN] state/config.js:28 — Shallow copy leaks references
- `{ ...DEFAULTS }` only shallow-copies top level, nested objects shared
- **Fix:** `JSON.parse(JSON.stringify(DEFAULTS))` for deep clone

## Priority 5: Quality (6 issues)

### Q1 [CONCERN] atomic.js:17 — readJSON swallows all errors
- Can't distinguish "file not found" from "JSON corrupted"
- **Fix:** Return `{ data, error }` tuple, or throw on corruption

### Q2 [CONCERN] detector.js:38 — Adds commands without checking availability
- pyproject.toml present → adds `ruff/mypy/pytest` even if not installed
- **Fix:** `which <cmd>` check before adding gate

### Q3 [CONCERN] context/budget.js:10 — Budget not persisted
- New instance every CLI call → always starts at 0
- **Fix:** Persist budget state to `.ham-autocode/context/budget.json`

### Q4 [CONCERN] context/manager.js:49 — No recommendation output
- Design: output `{ recommendation: "normal"|"advisory"|"compress"|"critical" }`
- Current: no recommendation field
- **Fix:** Add threshold-based recommendation

### Q5 [STYLE] cli.test.js — Uses string execSync, fails in some environments
- **Fix:** Use direct require() + function calls instead of spawning process

### Q6 [BUG] git.test.js — Assumes git repo exists, fails in non-git env
- **Fix:** Create temp git repo in test setup
