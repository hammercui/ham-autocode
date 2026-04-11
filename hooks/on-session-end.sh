#!/bin/bash
# ham-autocode v2.0 SessionEnd Hook
# Uses core engine CLI to mark pipeline as interrupted.

CORE_CLI="${CLAUDE_PROJECT_DIR:-.}/core/index.js"

# Check if core engine exists
if [ ! -f "$CORE_CLI" ]; then
    exit 0
fi

# Log the interruption via pipeline CLI
node "$CORE_CLI" pipeline log "session ended - marking as interrupted" 2>/dev/null

# Mark pipeline as interrupted using atomic write
node -e "
const path = require('path');
const projectDir = process.env.CLAUDE_PROJECT_DIR || '.';
try {
  const { readPipeline, writePipeline } = require(path.join(projectDir, 'core', 'state', 'pipeline'));
  const data = readPipeline(projectDir);
  if (data && data.status === 'running') {
    data.status = 'interrupted';
    data.interrupted_at = new Date().toISOString();
    writePipeline(projectDir, data);
  }
} catch(e) { /* silent */ }
" 2>/dev/null

exit 0
