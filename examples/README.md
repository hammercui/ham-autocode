# ham-autocode Examples

Quick verification and demo scripts for ham-autocode.

## 1. Verify Installation (3 steps)

```bash
# Step 1: Clone and install
git clone https://github.com/hammercui/ham-autocode.git
cd ham-autocode
npm ci

# Step 2: Build
npm run build

# Step 3: Run tests (8 suites)
npm test
```

Expected output:
```
[TEST] token.test.js ... PASS
[TEST] git.test.js ... PASS
[TEST] lock.test.js ... PASS
[TEST] atomic.test.js ... PASS
[TEST] graph.test.js ... PASS
[TEST] scorer.test.js ... PASS
[TEST] budget.test.js ... PASS
[TEST] cli.test.js ... PASS
8/8 suites passed
```

## 2. CLI Quick Tour

After `npm run build`, you can run CLI commands directly:

```bash
# Show harness configuration
node dist/index.js config show

# DAG statistics (needs .planning/ with a PLAN.md)
node dist/index.js dag stats

# Context budget status
node dist/index.js context budget

# Health check (run in any project directory)
node dist/index.js health check
node dist/index.js health drift
node dist/index.js health esm-cjs

# Learning system
node dist/index.js learn hints
node dist/index.js learn patterns
```

## 3. As Claude Code Plugin

```bash
# Load as plugin
claude --plugin-dir ./ham-autocode

# In Claude Code, try:
# /ham-autocode:status    — show pipeline state
# /ham-autocode:detect    — analyze current project
# /ham-autocode:auto      — run full autonomous pipeline
```

## 4. Automated Verification

```bash
bash examples/verify.sh
```

Runs environment check, build, tests, and CLI smoke tests. Exit 0 = all good.
