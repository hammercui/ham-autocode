# ham-autocode v2.0 Harness Design (Revised)

> 基于 Codex (GPT-5.4) 架构审查修订。收敛版：每个能力都有闭环定义。

## Design Decisions (Revised)

| Dimension | v2 Draft | v2 Revised | Change Reason |
|-----------|----------|------------|---------------|
| Task System | Layered DAG | **Single-layer task DAG + phase/milestone labels** | Codex: 分层 DAG 只有口号没有实体 |
| Config | YAML + JSON Schema | **JSON-only config** | Codex: 零依赖下 YAML parser 不可取 |
| Routing targets | codex/claude-code/agent-teams/app | **codex \| claude-code \| app** (3 targets) | Codex: agent-teams 是额外执行语义，v3 再加 |
| Recovery | checkpoint/worktree/branch | **checkpoint \| worktree** (2 tiers) | Codex: branch 没有 CLI 闭环 |
| Validation output | Auto-commit on pass | **Validate + recommend** (no auto-commit) | Codex: auto-commit 是另一套策略问题 |
| Execution | Implicit "via appropriate agent" | **Explicit executor/adapter layer** | Codex: 缺执行适配层 |
| State writes | Direct JSON write | **Atomic write with lock** | Codex: 并行任务会写坏状态文件 |
| Runtime | Node.js zero deps | **Node.js zero deps** (unchanged) | Feasible for revised scope |

## Architecture (Revised)

```
User → Skills (7) → Core Engine (Node.js) → Executor Adapters → Claude Code/Codex/App
                         ↑
                    Hooks (callbacks INTO core, not FROM core)

Core Engine:
  ├── DAG Scheduler      (topological sort, wave parallelism)
  ├── Context Engine      (token budget, selective loading, 3-tier protection)
  ├── Agent Router        (spec/complexity/isolation scoring)
  ├── Executor Adapters   (claude-code adapter, codex adapter, app adapter)  ← NEW
  ├── Validation Gates    (detect + run + capture result, two-strike)
  ├── Recovery Engine     (checkpoint + worktree, 2-tier)
  └── State Store         (atomic JSON read/write with file lock)
```

### Hook Direction (Clarified)

Hooks are **callbacks INTO core**, not core driving hooks:
```
Claude Code runtime → SessionStart → calls node core/index.js session-start
Claude Code runtime → SessionEnd → calls node core/index.js session-end
Claude Code runtime → PostToolUse → calls node core/index.js post-tool-use
```
Core engine is passive — it responds to hooks and CLI calls, never initiates.

## Task Model (Single-Layer DAG)

### Why single-layer, not layered

Codex correctly identified: the "layered DAG" had no milestone/phase entities in the schema —
only task-level `blockedBy`. Rather than add complex multi-level graph management,
v2 uses a flat task DAG with **labels** for organization:

```
task.phase = "40-core"       ← label, not a graph node
task.milestone = "M001"      ← label, not a graph node
task.blockedBy = ["task-003"] ← actual dependency edge
```

Phase and milestone are for **display grouping and filtering only**.
The scheduler sees only tasks and their `blockedBy` edges.

### Task Schema (task-001.json)

```json
{
  "schemaVersion": 2,
  "id": "task-001",
  "name": "Implement user auth API",
  "milestone": "M001",
  "phase": "40-core",
  "status": "pending",
  "blockedBy": ["task-003"],
  "files": ["src/api/auth.ts", "src/middleware/jwt.ts"],

  "spec": {
    "description": "REST endpoint for user authentication",
    "interface": "POST /api/auth/login -> { token: string }",
    "acceptance": "Returns JWT on valid credentials, 401 on invalid",
    "completeness": 100
  },

  "scores": {
    "specScore": 100,
    "complexityScore": 45,
    "isolationScore": 85
  },

  "routing": {
    "target": "codex",
    "reason": "specScore=100, isolationScore=85, single module",
    "needsConfirmation": false,
    "confirmed": true
  },

  "recovery": {
    "strategy": "checkpoint",
    "checkpointRef": null
  },

  "validation": {
    "gates": ["lint", "typecheck", "test"],
    "attempts": 0,
    "maxAttempts": 2,
    "results": []
  },

  "context": {
    "requiredFiles": ["src/api/auth.ts", "src/types/user.ts"],
    "estimatedTokens": 2400
  },

  "execution": {
    "sessionId": null,
    "startedAt": null,
    "completedAt": null,
    "error": null,
    "errorType": null
  }
}
```

### Status Enum (Unified)

```
pending     → ready to be scheduled (blockedBy all resolved)
blocked     → waiting on unresolved blockedBy
in_progress → currently being executed by an agent
validating  → execution done, running validation gates
done        → validated and passed
failed      → two-strike validation failed, needs human intervention
skipped     → manually skipped by user
```

### Failure Types (Classified)

```
agent_error     → agent crashed or produced no output
tool_error      → git/lint/test command failed
validation_fail → lint/typecheck/test gate failed
context_exceeded → token budget exceeded during execution
state_error     → pipeline.json / task file write failed
user_rejected   → human rejected routing or plan
timeout         → execution exceeded time limit
```

## Routing (3 Targets, Unified Enum)

```
Target enum: "codex" | "claude-code" | "claude-app"

Routing rules:
  specScore >= 80 AND isolationScore >= 70  → codex
  complexityScore >= 70                     → claude-code
  task type in [doc, config, hotfix]        → claude-app
  else                                      → claude-code (default)

High-risk confirmation:
  complexityScore >= 90 → set needsConfirmation=true
  Skill asks user to confirm before execution starts
  CLI: node core/index.js route confirm <task-id>
```

## Executor Adapters (NEW)

The missing layer between "route decision" and "actual execution".

```
core/executor/
  ├── adapter.js        # Base interface
  ├── claude-code.js    # Drives Claude Code subagent
  ├── codex.js          # Generates Codex task spec for user
  └── claude-app.js     # Generates lightweight task description
```

### Interface

Each adapter implements:
```javascript
{
  // Prepare execution context
  prepare(task, contextFiles) → { prompt, files, constraints }

  // Generate the execution instruction (skill prompt or codex spec)
  generateInstruction(task) → string

  // Parse execution result and determine success/failure
  parseResult(output) → { success: boolean, errorType?: string, changes?: string[] }
}
```

### How execution actually works

Core engine does NOT directly call agents. Instead:
1. Core prepares context + routing decision
2. Core outputs structured instruction to stdout
3. **Skill reads core output and delegates to the appropriate agent**
4. Skill feeds result back to core via `node core/index.js dag complete` or `dag fail`

```
Skill (SKILL.md)
  ├── calls core → gets task + routing + context
  ├── if target=claude-code → delegates to subagent with prepared prompt
  ├── if target=codex → prints Codex spec for user to copy
  ├── if target=claude-app → prints lightweight task for App
  └── feeds result back → core validates + updates state
```

This keeps core engine as pure data/logic — no agent invocation.

## State Management (Atomic Writes)

### File Lock Protocol

```javascript
// core/state/lock.js
// Uses mkdir as atomic lock (works cross-platform)

function acquireLock(stateDir) {
  const lockDir = path.join(stateDir, '.lock');
  try {
    fs.mkdirSync(lockDir); // atomic on all OS
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false; // already locked
    throw e;
  }
}

function releaseLock(stateDir) {
  fs.rmdirSync(path.join(stateDir, '.lock'));
}
```

### Atomic Write Protocol

```javascript
// Write to temp file, then rename (atomic on same filesystem)
function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath); // atomic
}
```

### Schema Versioning

All state files include `"schemaVersion": 2`.
On read, if schemaVersion < current, run migration before use.

```javascript
// core/state/migrate.js
const migrations = {
  1: (data) => { /* v1 → v2 migration */ return data; }
};
```

## Validation (No Auto-Commit)

### Flow (Revised, No Contradictions)

```
Task execution complete
  ↓
node core/index.js validate <task-id>
  ↓
Detect gates: check package.json scripts, Makefile, etc.
  ↓
Run each gate sequentially: lint → typecheck → test
  ↓
├── ALL PASS:
│   → Update task: status="done", validation.results=[{gate, pass, output}]
│   → Output: "Task task-001 PASSED. Recommend: git add + commit"
│   → (Skill decides whether to commit — NOT core's job)
│
├── ANY FAIL (attempt < maxAttempts):
│   → Update task: attempts++, validation.results=[{gate, fail, error}]
│   → Output: "Task task-001 FAILED gate [lint]. Error: [msg]. Retrying."
│   → Return error to skill for agent retry
│
└── ANY FAIL (attempt >= maxAttempts):
    → Update task: status="failed", errorType="validation_fail"
    → If recovery=checkpoint: run rollback
    → Output: "Task task-001 BLOCKED after 2 attempts. Needs human review."
    → Pipeline continues with next wave (failed task does not block unrelated tasks)
```

### Unblocking Failed Tasks

```
CLI: node core/index.js dag retry <task-id>   → reset to pending, clear attempts
CLI: node core/index.js dag skip <task-id>    → mark skipped, unblock dependents
CLI: node core/index.js dag unblock <task-id> → force unblock (override blockedBy)
```

## Recovery (2 Tiers)

```
Tier 1: Checkpoint (low risk — complexityScore < 70)
  Before: git tag ham-checkpoint-<task-id>
  Rollback: git checkout ham-checkpoint-<task-id> -- <files>
  Cleanup: git tag -d ham-checkpoint-<task-id> (after task done)

Tier 2: Worktree (high risk — complexityScore >= 70)
  Before: git worktree add .ham-autocode/worktrees/<task-id> -b ham-wt-<task-id>
  Success: merge worktree branch, remove worktree
  Rollback: remove worktree + delete branch
  Naming: ham-wt-<task-id>
  Cleanup: automatic after merge or rollback
```

## Context Engine

### Token Budget (Honest Limitations)

`chars / 4` is a rough estimate with ~20-30% error.
Thresholds are set conservatively to account for this:

```
< 30%   → Normal: no action
30-50%  → Advisory: log warning, suggest context pruning
50-70%  → Compress: fold completed task outputs in log
> 70%   → Critical: recommend session restart or subagent isolation
```

Note: Core engine **recommends** actions, it does not force them.
The skill/user decides whether to follow recommendations.
This avoids the "误判导致错误自动化" risk Codex identified.

### Selective File Loading

```
node core/index.js context prepare <task-id>

Output:
{
  "taskId": "task-001",
  "requiredFiles": ["src/api/auth.ts", "src/types/user.ts"],
  "estimatedTokens": 2400,
  "budgetRemaining": 45000,
  "recommendation": "normal"
}
```

Skill reads this and only loads listed files into the agent's context.

## Config (JSON-Only)

### harness.json (not YAML)

```json
{
  "schemaVersion": 2,
  "context": {
    "advisoryThreshold": 30,
    "compressThreshold": 50,
    "criticalThreshold": 70
  },
  "validation": {
    "mode": "strict",
    "maxAttempts": 2,
    "gates": ["lint", "typecheck", "test"],
    "onFinalFail": "block"
  },
  "routing": {
    "confirmThreshold": 90,
    "codexMinSpecScore": 80,
    "codexMinIsolationScore": 70,
    "defaultTarget": "claude-code"
  },
  "recovery": {
    "lowRiskStrategy": "checkpoint",
    "highRiskThreshold": 70,
    "highRiskStrategy": "worktree"
  }
}
```

Zero-config: if `harness.json` doesn't exist, all values above are defaults.

## Core Engine CLI (Revised)

```bash
# Hooks (called by Claude Code runtime):
node core/index.js session-start      # Inject pipeline state as context
node core/index.js session-end        # Mark interrupted if running
node core/index.js post-tool-use      # Token budget advisory

# DAG:
node core/index.js dag init           # Parse PLAN.md/WBS → build task graph
node core/index.js dag next-wave      # Get next executable tasks
node core/index.js dag complete <id>  # Mark done, unblock dependents
node core/index.js dag fail <id> <errorType>  # Mark failed with error type
node core/index.js dag retry <id>     # Reset failed task to pending
node core/index.js dag skip <id>      # Mark skipped, unblock dependents
node core/index.js dag unblock <id>   # Force unblock
node core/index.js dag status         # Show full DAG status

# Context:
node core/index.js context prepare <id>  # Get files + budget for a task
node core/index.js context budget        # Show current budget estimate

# Routing:
node core/index.js route <id>           # Get routing decision
node core/index.js route confirm <id>   # Human confirms high-risk routing
node core/index.js route batch          # Route all pending tasks

# Validation:
node core/index.js validate detect      # Auto-detect project lint/test
node core/index.js validate <id>        # Run validation gates

# Recovery:
node core/index.js recover checkpoint <id>   # Create checkpoint before task
node core/index.js recover rollback <id>     # Rollback task changes
node core/index.js recover worktree-create <id>  # Create worktree
node core/index.js recover worktree-merge <id>   # Merge successful worktree
node core/index.js recover worktree-remove <id>  # Remove failed worktree

# Config:
node core/index.js config show          # Show effective config
node core/index.js config validate      # Validate harness.json against schema

# Pipeline:
node core/index.js pipeline status      # Show pipeline state
node core/index.js pipeline pause       # Mark paused
node core/index.js pipeline resume      # Mark running
```

## Key Flow (Revised, No Contradictions)

### /ham-autocode:auto Full Pipeline

```
1. Skill reads harness.json (or uses defaults)

2. Skill calls: node core/index.js dag init
   → Core parses PLAN.md/WBS → creates .ham-autocode/tasks/*.json
   → If parse fails: output error, skill asks AI to generate tasks

3. Skill calls: node core/index.js route batch
   → Core scores all tasks, assigns routing targets
   → Returns tasks needing human confirmation (complexityScore >= 90)
   → Skill asks user to confirm high-risk tasks

4. Skill calls: node core/index.js dag next-wave
   → Returns tasks where: status=pending AND all blockedBy are done/skipped

5. For each task in wave:
   a. node core/index.js context prepare <task-id>
      → Returns required files + budget recommendation
   b. node core/index.js recover checkpoint <task-id>
      → Creates git checkpoint (or worktree for high-risk)
   c. Skill reads routing.target from task file:
      - "claude-code" → skill delegates to subagent with prepared context
      - "codex" → skill outputs Codex spec for user
      - "claude-app" → skill outputs lightweight task description
   d. After execution:
      - Success → node core/index.js validate <task-id>
        - Pass → node core/index.js dag complete <task-id>
          → Skill recommends: "git add + commit these files"
        - Fail (attempt < max) → retry with error context
        - Fail (attempt >= max) → node core/index.js dag fail <task-id> validation_fail
          → Core runs rollback, skill reports blocked task to user
      - Agent error → node core/index.js dag fail <task-id> agent_error
        → Core runs rollback

6. Repeat 4-5 until dag next-wave returns empty

7. Check completion:
   - All tasks done/skipped → pipeline complete
   - Some tasks failed → pipeline partial, report summary
```

## Directory Structure (Revised)

```
ham-autocode/
├── .claude-plugin/plugin.json
├── core/
│   ├── index.js                     # CLI dispatcher
│   ├── dag/
│   │   ├── graph.js                 # DAG + topological sort
│   │   ├── scheduler.js             # Wave scheduler
│   │   └── parser.js                # PLAN.md/WBS → tasks
│   ├── context/
│   │   ├── budget.js                # Token budget tracking
│   │   └── manager.js               # Selective loading + advisory
│   ├── routing/
│   │   ├── scorer.js                # Multi-dim scoring
│   │   └── router.js                # Score → target decision
│   ├── executor/                    # NEW: Execution adapters
│   │   ├── adapter.js               # Base interface
│   │   ├── claude-code.js           # Subagent prompt generator
│   │   ├── codex.js                 # Codex spec generator
│   │   └── claude-app.js            # Lightweight task generator
│   ├── validation/
│   │   ├── detector.js              # Auto-detect lint/test commands
│   │   └── gates.js                 # Two-strike gate runner
│   ├── recovery/
│   │   ├── checkpoint.js            # Git tag checkpoint
│   │   └── worktree.js              # Git worktree lifecycle
│   ├── state/
│   │   ├── lock.js                  # mkdir-based file lock
│   │   ├── atomic.js                # Atomic JSON write (tmp+rename)
│   │   ├── pipeline.js              # pipeline.json operations
│   │   ├── task-graph.js            # tasks/*.json operations
│   │   ├── config.js                # harness.json load + defaults
│   │   └── migrate.js               # Schema version migration
│   └── utils/
│       ├── token.js                 # Token estimation (chars/4)
│       └── git.js                   # Git operations wrapper
├── skills/ (7)
├── agents/ (5)
├── hooks/
│   ├── hooks.json
│   ├── on-session-start.sh
│   ├── on-session-end.sh
│   └── on-post-tool-use.sh
├── schemas/
│   ├── pipeline.schema.json
│   ├── task.schema.json
│   └── harness.schema.json
├── defaults/
│   └── harness.json                 # Built-in defaults (JSON, not YAML)
├── loop.md
├── settings.json
└── docs/
```

## Runtime State (Revised)

```
.ham-autocode/
├── harness.json                     # Project config (JSON)
├── pipeline.json                    # Pipeline state
├── tasks/                           # Task DAG (one file per task)
│   ├── task-001.json
│   └── ...
├── context/
│   └── file-index.json              # Project file index + token estimates
├── worktrees/                       # Active worktrees (auto-cleaned)
├── logs/
│   └── trace.jsonl                  # Execution trace
├── .lock/                           # State lock directory (transient)
└── session_id                       # Current session for --resume
```

## What v2 Does NOT Do (Deferred to v3)

- Agent Teams orchestration (v3)
- Branch-based recovery (v3)
- Auto-commit (v3 — v2 only recommends)
- TypeScript guardrail rules (v3)
- DAG visualization / Web Dashboard (v3)
- Evaluation system / automated scoring (v3)
- YAML config (v3 — v2 is JSON-only)
- Full JSON Schema validation at runtime (v3 — v2 does basic field checks)

## Design Principles (Revised)

1. **Every feature has a closed loop** — No capability without CLI, schema, and flow alignment
2. **Core is pure data/logic** — Never invokes agents; outputs instructions for skills
3. **Atomic state writes** — Lock + tmp + rename for every state mutation
4. **Recommend, don't force** — Context engine advises, skill/user decides
5. **Classify every failure** — 7 error types, each with defined handler
6. **Schema versioning** — All state files include schemaVersion for migration
7. **Zero-config runs** — defaults/harness.json covers everything
8. **3 targets, 2 recovery tiers** — Deliberately constrained for reliability
