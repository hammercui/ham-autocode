# v2.0 Harness Core Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Node.js core engine for ham-autocode v2.0 Harness — DAG scheduler, context engine, agent router, executor adapters, validation gates, recovery engine, and atomic state management.

**Architecture:** Pure Node.js (zero npm deps), CLI-driven engine called by skills and hooks. Core is passive data/logic — never invokes agents directly.

**Tech Stack:** Node.js (ESM), fs/path/child_process standard libs only.

---

## Task 1: Utils — Token Estimation + Git Wrapper

**Files:**
- Create: `core/utils/token.js`
- Create: `core/utils/git.js`
- Test: `core/__tests__/utils/token.test.js`
- Test: `core/__tests__/utils/git.test.js`

**Step 1: Write token.js**

```javascript
// core/utils/token.js
'use strict';
const fs = require('fs');
const path = require('path');

/** Estimate token count from text (chars / 4, ~20-30% error margin) */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Estimate tokens for a file by path */
function estimateFileTokens(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return estimateTokens(content);
  } catch {
    return 0;
  }
}

/** Build file index with token estimates for a directory */
function buildFileIndex(rootDir, extensions = ['.js', '.ts', '.py', '.md', '.json']) {
  const index = {};
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        walk(full);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        const rel = path.relative(rootDir, full).replace(/\\/g, '/');
        index[rel] = { tokens: estimateFileTokens(full), size: fs.statSync(full).size };
      }
    }
  }
  walk(rootDir);
  return index;
}

module.exports = { estimateTokens, estimateFileTokens, buildFileIndex };
```

**Step 2: Write git.js**

```javascript
// core/utils/git.js
'use strict';
const { execSync } = require('child_process');

function run(cmd, cwd) {
  try {
    return { ok: true, output: execSync(cmd, { cwd, encoding: 'utf8', timeout: 30000 }).trim() };
  } catch (e) {
    return { ok: false, output: e.stderr || e.message };
  }
}

const git = {
  tag(name, cwd) { return run(`git tag "${name}"`, cwd); },
  deleteTag(name, cwd) { return run(`git tag -d "${name}"`, cwd); },
  checkoutFiles(ref, files, cwd) {
    return run(`git checkout "${ref}" -- ${files.map(f => `"${f}"`).join(' ')}`, cwd);
  },
  worktreeAdd(path_, branch, cwd) {
    return run(`git worktree add "${path_}" -b "${branch}"`, cwd);
  },
  worktreeRemove(path_, cwd) {
    return run(`git worktree remove "${path_}" --force`, cwd);
  },
  branchDelete(name, cwd) { return run(`git branch -D "${name}"`, cwd); },
  merge(branch, cwd) { return run(`git merge "${branch}"`, cwd); },
  status(cwd) { return run('git status --porcelain', cwd); },
  log(n, cwd) { return run(`git log --oneline -${n}`, cwd); },
  diff(cwd) { return run('git diff --stat', cwd); },
};

module.exports = git;
```

**Step 3: Write tests**

```javascript
// core/__tests__/utils/token.test.js
const { estimateTokens } = require('../../utils/token');
const assert = require('assert');

assert.strictEqual(estimateTokens(''), 0);
assert.strictEqual(estimateTokens('abcd'), 1);
assert.strictEqual(estimateTokens('a'.repeat(100)), 25);
assert.strictEqual(estimateTokens(null), 0);
console.log('token tests passed');
```

**Step 4: Run tests**

Run: `node core/__tests__/utils/token.test.js`
Expected: "token tests passed"

**Step 5: Commit**

```bash
git add core/utils/ core/__tests__/
git commit -m "feat(core): add token estimation and git wrapper utils"
```

---

## Task 2: State — Lock, Atomic Write, Config, Migration

**Files:**
- Create: `core/state/lock.js`
- Create: `core/state/atomic.js`
- Create: `core/state/config.js`
- Create: `core/state/migrate.js`
- Create: `core/state/pipeline.js`
- Create: `core/state/task-graph.js`
- Create: `defaults/harness.json`
- Test: `core/__tests__/state/lock.test.js`
- Test: `core/__tests__/state/atomic.test.js`

**Step 1: Write lock.js**

```javascript
// core/state/lock.js
'use strict';
const fs = require('fs');
const path = require('path');

const LOCK_DIR = '.lock';
const LOCK_TIMEOUT = 5000; // ms

function acquireLock(stateDir) {
  const lockPath = path.join(stateDir, LOCK_DIR);
  const start = Date.now();
  while (Date.now() - start < LOCK_TIMEOUT) {
    try {
      fs.mkdirSync(lockPath, { recursive: false });
      return true;
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Check if stale (> 30s old)
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 30000) {
            fs.rmdirSync(lockPath);
            continue;
          }
        } catch { /* ignore */ }
        // Wait and retry
        const wait = Math.floor(Math.random() * 100) + 50;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
        continue;
      }
      throw e;
    }
  }
  return false;
}

function releaseLock(stateDir) {
  const lockPath = path.join(stateDir, LOCK_DIR);
  try { fs.rmdirSync(lockPath); } catch { /* already released */ }
}

function withLock(stateDir, fn) {
  if (!acquireLock(stateDir)) throw new Error('Failed to acquire state lock');
  try { return fn(); } finally { releaseLock(stateDir); }
}

module.exports = { acquireLock, releaseLock, withLock };
```

**Step 2: Write atomic.js**

```javascript
// core/state/atomic.js
'use strict';
const fs = require('fs');
const path = require('path');

function atomicWriteJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { atomicWriteJSON, readJSON };
```

**Step 3: Write config.js with defaults**

```javascript
// core/state/config.js
'use strict';
const path = require('path');
const { readJSON } = require('./atomic');

const DEFAULTS = {
  schemaVersion: 2,
  context: { advisoryThreshold: 30, compressThreshold: 50, criticalThreshold: 70 },
  validation: { mode: 'strict', maxAttempts: 2, gates: ['lint', 'typecheck', 'test'], onFinalFail: 'block' },
  routing: { confirmThreshold: 90, codexMinSpecScore: 80, codexMinIsolationScore: 70, defaultTarget: 'claude-code' },
  recovery: { lowRiskStrategy: 'checkpoint', highRiskThreshold: 70, highRiskStrategy: 'worktree' },
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadConfig(projectDir) {
  const userConfig = readJSON(path.join(projectDir, '.ham-autocode', 'harness.json'));
  return userConfig ? deepMerge(DEFAULTS, userConfig) : { ...DEFAULTS };
}

module.exports = { loadConfig, DEFAULTS };
```

**Step 4: Write migrate.js**

```javascript
// core/state/migrate.js
'use strict';
const CURRENT_VERSION = 2;

const migrations = {
  // 1: (data) => { data.schemaVersion = 2; return data; }
};

function migrate(data) {
  if (!data || !data.schemaVersion) {
    data = data || {};
    data.schemaVersion = CURRENT_VERSION;
    return data;
  }
  let version = data.schemaVersion;
  while (version < CURRENT_VERSION) {
    if (migrations[version]) {
      data = migrations[version](data);
    }
    version++;
    data.schemaVersion = version;
  }
  return data;
}

module.exports = { migrate, CURRENT_VERSION };
```

**Step 5: Write pipeline.js**

```javascript
// core/state/pipeline.js
'use strict';
const path = require('path');
const { atomicWriteJSON, readJSON } = require('./atomic');
const { withLock } = require('./lock');
const { migrate } = require('./migrate');

function pipelinePath(projectDir) {
  return path.join(projectDir, '.ham-autocode', 'pipeline.json');
}

function stateDir(projectDir) {
  return path.join(projectDir, '.ham-autocode');
}

function readPipeline(projectDir) {
  const data = readJSON(pipelinePath(projectDir));
  return data ? migrate(data) : null;
}

function writePipeline(projectDir, data) {
  data.updated_at = new Date().toISOString();
  withLock(stateDir(projectDir), () => {
    atomicWriteJSON(pipelinePath(projectDir), data);
  });
}

function initPipeline(projectDir, projectName) {
  const data = {
    schemaVersion: 2,
    project: projectName,
    status: 'running',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_task: null,
    log: [],
  };
  writePipeline(projectDir, data);
  return data;
}

function appendLog(projectDir, action) {
  const pipeline = readPipeline(projectDir);
  if (!pipeline) return;
  pipeline.log.push({ time: new Date().toISOString(), action });
  writePipeline(projectDir, pipeline);
}

module.exports = { readPipeline, writePipeline, initPipeline, appendLog };
```

**Step 6: Write task-graph.js**

```javascript
// core/state/task-graph.js
'use strict';
const fs = require('fs');
const path = require('path');
const { atomicWriteJSON, readJSON } = require('./atomic');
const { withLock } = require('./lock');

function tasksDir(projectDir) {
  return path.join(projectDir, '.ham-autocode', 'tasks');
}

function taskPath(projectDir, taskId) {
  return path.join(tasksDir(projectDir), taskId + '.json');
}

function readTask(projectDir, taskId) {
  return readJSON(taskPath(projectDir, taskId));
}

function writeTask(projectDir, task) {
  const dir = tasksDir(projectDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const sd = path.join(projectDir, '.ham-autocode');
  withLock(sd, () => {
    atomicWriteJSON(taskPath(projectDir, task.id), task);
  });
}

function readAllTasks(projectDir) {
  const dir = tasksDir(projectDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => readJSON(path.join(dir, f)))
    .filter(Boolean);
}

function updateTaskStatus(projectDir, taskId, status, extra = {}) {
  const task = readTask(projectDir, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  task.status = status;
  Object.assign(task, extra);
  writeTask(projectDir, task);
  return task;
}

module.exports = { readTask, writeTask, readAllTasks, updateTaskStatus, tasksDir };
```

**Step 7: Create defaults/harness.json**

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

**Step 8: Write tests + run**

Run: `node core/__tests__/state/lock.test.js && node core/__tests__/state/atomic.test.js`

**Step 9: Commit**

```bash
git add core/state/ defaults/ core/__tests__/state/
git commit -m "feat(core): add atomic state management with file lock and config"
```

---

## Task 3: DAG — Graph, Topological Sort, Wave Scheduler

**Files:**
- Create: `core/dag/graph.js`
- Create: `core/dag/scheduler.js`
- Create: `core/dag/parser.js`
- Test: `core/__tests__/dag/graph.test.js`

**Step 1: Write graph.js**

```javascript
// core/dag/graph.js
'use strict';

/** Topological sort using Kahn's algorithm. Returns { sorted, cycles } */
function topoSort(tasks) {
  const graph = new Map(); // id → { task, edges: Set }
  const inDegree = new Map();

  for (const t of tasks) {
    graph.set(t.id, { task: t, edges: new Set(t.blockedBy || []) });
    inDegree.set(t.id, (t.blockedBy || []).length);
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const id = queue.shift();
    sorted.push(graph.get(id).task);
    for (const [otherId, node] of graph) {
      if (node.edges.has(id)) {
        node.edges.delete(id);
        inDegree.set(otherId, inDegree.get(otherId) - 1);
        if (inDegree.get(otherId) === 0) queue.push(otherId);
      }
    }
  }

  const cycles = tasks.filter(t => !sorted.find(s => s.id === t.id)).map(t => t.id);
  return { sorted, cycles };
}

/** Detect if adding edge from→to would create a cycle */
function wouldCycle(tasks, fromId, toId) {
  // BFS from toId, see if we can reach fromId
  const visited = new Set();
  const queue = [toId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === fromId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const task = tasks.find(t => t.id === current);
    if (task && task.blockedBy) {
      for (const dep of task.blockedBy) queue.push(dep);
    }
  }
  return false;
}

module.exports = { topoSort, wouldCycle };
```

**Step 2: Write scheduler.js**

```javascript
// core/dag/scheduler.js
'use strict';

const DONE_STATUSES = new Set(['done', 'skipped']);

/** Get next wave of executable tasks (all blockedBy resolved) */
function nextWave(tasks) {
  return tasks.filter(t => {
    if (t.status !== 'pending') return false;
    if (!t.blockedBy || t.blockedBy.length === 0) return true;
    return t.blockedBy.every(depId => {
      const dep = tasks.find(d => d.id === depId);
      return dep && DONE_STATUSES.has(dep.status);
    });
  });
}

/** Compute DAG statistics */
function dagStats(tasks) {
  const total = tasks.length;
  const byStatus = {};
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }
  const done = (byStatus.done || 0) + (byStatus.skipped || 0);
  return { total, byStatus, done, remaining: total - done, progress: total > 0 ? Math.round(done / total * 100) : 0 };
}

module.exports = { nextWave, dagStats };
```

**Step 3: Write parser.js (Markdown → Tasks)**

```javascript
// core/dag/parser.js
'use strict';
const fs = require('fs');

/**
 * Parse a structured plan file into task objects.
 * Expects markdown with task blocks containing id, name, files, dependencies, spec.
 * This is a best-effort parser — AI fills gaps for unstructured plans.
 */
function parsePlanToTasks(planContent, milestone, phase) {
  const tasks = [];
  // Match markdown headers that look like tasks: ### Task N: Name
  const taskRegex = /###\s+(?:Task\s+)?(\d+)[:.]\s*(.+)/g;
  let match;
  let taskNum = 1;

  while ((match = taskRegex.exec(planContent)) !== null) {
    const id = `task-${String(taskNum).padStart(3, '0')}`;
    const name = match[2].trim();

    // Extract files from the section after the header
    const sectionStart = match.index + match[0].length;
    const nextHeader = planContent.indexOf('\n### ', sectionStart + 1);
    const section = planContent.slice(sectionStart, nextHeader > -1 ? nextHeader : undefined);

    const files = [];
    const fileRegex = /[`"]([^\s`"]+\.[a-zA-Z]+)[`"]/g;
    let fileMatch;
    while ((fileMatch = fileRegex.exec(section)) !== null) {
      if (!files.includes(fileMatch[1])) files.push(fileMatch[1]);
    }

    tasks.push({
      schemaVersion: 2,
      id,
      name,
      milestone: milestone || 'M001',
      phase: phase || 'default',
      status: 'pending',
      blockedBy: [],
      files,
      spec: { description: name, interface: '', acceptance: '', completeness: 0 },
      scores: { specScore: 0, complexityScore: 0, isolationScore: 0 },
      routing: { target: 'claude-code', reason: 'default', needsConfirmation: false, confirmed: false },
      recovery: { strategy: 'checkpoint', checkpointRef: null },
      validation: { gates: [], attempts: 0, maxAttempts: 2, results: [] },
      context: { requiredFiles: files, estimatedTokens: 0 },
      execution: { sessionId: null, startedAt: null, completedAt: null, error: null, errorType: null },
    });
    taskNum++;
  }

  // Infer dependencies: if task B's files overlap with task A's, B may depend on A
  // (Best-effort — AI should refine via dag init)

  return tasks;
}

module.exports = { parsePlanToTasks };
```

**Step 4: Write test + run**

```javascript
// core/__tests__/dag/graph.test.js
const { topoSort } = require('../../dag/graph');
const { nextWave, dagStats } = require('../../dag/scheduler');
const assert = require('assert');

// topoSort test
const tasks = [
  { id: 'a', blockedBy: [] },
  { id: 'b', blockedBy: ['a'] },
  { id: 'c', blockedBy: ['a'] },
  { id: 'd', blockedBy: ['b', 'c'] },
];
const { sorted, cycles } = topoSort(tasks);
assert.strictEqual(sorted[0].id, 'a');
assert.strictEqual(sorted[sorted.length - 1].id, 'd');
assert.strictEqual(cycles.length, 0);

// nextWave test
const tasks2 = [
  { id: 'a', status: 'done', blockedBy: [] },
  { id: 'b', status: 'pending', blockedBy: ['a'] },
  { id: 'c', status: 'pending', blockedBy: ['a'] },
  { id: 'd', status: 'pending', blockedBy: ['b'] },
];
const wave = nextWave(tasks2);
assert.strictEqual(wave.length, 2); // b and c
assert.ok(wave.find(t => t.id === 'b'));
assert.ok(wave.find(t => t.id === 'c'));

// dagStats test
const stats = dagStats(tasks2);
assert.strictEqual(stats.total, 4);
assert.strictEqual(stats.done, 1);
assert.strictEqual(stats.progress, 25);

console.log('DAG tests passed');
```

Run: `node core/__tests__/dag/graph.test.js`
Expected: "DAG tests passed"

**Step 5: Commit**

```bash
git add core/dag/ core/__tests__/dag/
git commit -m "feat(core): add DAG graph, topological sort, wave scheduler, plan parser"
```

---

## Task 4: Context Engine — Budget + Manager

**Files:**
- Create: `core/context/budget.js`
- Create: `core/context/manager.js`

**Step 1: Write budget.js + manager.js**

budget.js tracks cumulative token estimates. manager.js provides context preparation per task.

**Step 2: Commit**

```bash
git add core/context/
git commit -m "feat(core): add context engine with token budget and selective loading"
```

---

## Task 5: Routing — Scorer + Router

**Files:**
- Create: `core/routing/scorer.js`
- Create: `core/routing/router.js`
- Test: `core/__tests__/routing/scorer.test.js`

**Step 1: Write scorer.js (3 dimensions)**

specScore (0-100): based on spec.completeness
complexityScore (0-100): based on files.length * 20 + blockedBy.length * 15
isolationScore (0-100): based on file overlap with other tasks

**Step 2: Write router.js (rules from design)**

**Step 3: Test + Commit**

```bash
git add core/routing/ core/__tests__/routing/
git commit -m "feat(core): add agent routing with multi-dim scoring"
```

---

## Task 6: Executor Adapters

**Files:**
- Create: `core/executor/adapter.js`
- Create: `core/executor/claude-code.js`
- Create: `core/executor/codex.js`
- Create: `core/executor/claude-app.js`

**Step 1: Write base adapter + 3 implementations**

Each adapter: prepare() → generateInstruction() → parseResult()

**Step 2: Commit**

```bash
git add core/executor/
git commit -m "feat(core): add executor adapters for claude-code, codex, claude-app"
```

---

## Task 7: Validation — Detector + Gates

**Files:**
- Create: `core/validation/detector.js`
- Create: `core/validation/gates.js`

**Step 1: Write detector.js**

Auto-detect lint/test commands from package.json, Makefile, pyproject.toml, Cargo.toml.

**Step 2: Write gates.js**

Two-strike gate runner: run detected commands, capture output, report pass/fail.

**Step 3: Commit**

```bash
git add core/validation/
git commit -m "feat(core): add validation gates with auto-detection and two-strike"
```

---

## Task 8: Recovery — Checkpoint + Worktree

**Files:**
- Create: `core/recovery/checkpoint.js`
- Create: `core/recovery/worktree.js`

**Step 1: Write checkpoint.js**

Git tag-based checkpoint: create, rollback, cleanup.

**Step 2: Write worktree.js**

Git worktree lifecycle: create, merge, remove.

**Step 3: Commit**

```bash
git add core/recovery/
git commit -m "feat(core): add recovery engine with checkpoint and worktree"
```

---

## Task 9: CLI Dispatcher

**Files:**
- Create: `core/index.js`
- Test: `core/__tests__/cli.test.js`

**Step 1: Write index.js**

Route CLI commands to appropriate modules. Parse `process.argv`, dispatch to dag/context/route/validate/recover/config/pipeline handlers.

**Step 2: Test all CLI commands**

```bash
node core/index.js config show
node core/index.js dag status
node core/index.js context budget
```

**Step 3: Commit**

```bash
git add core/index.js core/__tests__/cli.test.js
git commit -m "feat(core): add CLI dispatcher for all harness commands"
```

---

## Task 10: Hooks Update

**Files:**
- Modify: `hooks/hooks.json`
- Modify: `hooks/on-session-start.sh`
- Modify: `hooks/on-session-end.sh`
- Create: `hooks/on-post-tool-use.sh`

**Step 1: Update all hooks to call core engine**

Replace inline node scripts with `node core/index.js <command>`.

**Step 2: Add PostToolUse hook for context budget**

**Step 3: Commit**

```bash
git add hooks/
git commit -m "feat(hooks): update all hooks to use core engine CLI"
```

---

## Task 11: Skills Update

**Files:**
- Modify: `skills/auto/SKILL.md`
- Modify: `skills/detect/SKILL.md`
- Modify: `skills/status/SKILL.md`
- Modify: `skills/pause/SKILL.md`
- Modify: `skills/resume/SKILL.md`
- Modify: `skills/parallel/SKILL.md`
- Modify: `skills/ship/SKILL.md`

**Step 1: Update each skill to call core engine CLI**

Replace v1.1 inline logic with `node core/index.js` calls.

**Step 2: Commit**

```bash
git add skills/
git commit -m "feat(skills): update all skills to use v2 core engine"
```

---

## Task 12: Schemas + Plugin Manifest Update

**Files:**
- Rewrite: `schemas/pipeline.schema.json`
- Create: `schemas/task.schema.json`
- Create: `schemas/harness.schema.json`
- Update: `.claude-plugin/plugin.json` (version → 2.0.0)

**Step 1: Write all schema files matching revised design**

**Step 2: Update plugin.json version to 2.0.0**

**Step 3: Commit + push**

```bash
git add schemas/ .claude-plugin/
git commit -m "feat: v2.0.0 harness core engine complete"
git push
```

---

## Implementation Order Summary

```
Task 1:  utils (token, git)           ← no deps, start here
Task 2:  state (lock, atomic, config) ← depends on nothing
Task 3:  DAG (graph, scheduler, parser) ← depends on state
Task 4:  context (budget, manager)     ← depends on state, utils
Task 5:  routing (scorer, router)      ← depends on state
Task 6:  executor (adapters)           ← depends on routing, context
Task 7:  validation (detector, gates)  ← depends on state, utils
Task 8:  recovery (checkpoint, worktree) ← depends on utils/git
Task 9:  CLI dispatcher (index.js)     ← depends on all above
Task 10: hooks update                  ← depends on CLI
Task 11: skills update                 ← depends on CLI
Task 12: schemas + manifest            ← final
```

Tasks 1-2 can be parallel. Tasks 3-8 can be partially parallel. Tasks 9-12 are sequential.
