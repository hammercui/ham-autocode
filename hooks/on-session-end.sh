#!/bin/bash
# ham-autocode v3.0 SessionEnd Hook
# Uses core engine CLI to mark pipeline as interrupted.

CORE_CLI="${CLAUDE_PLUGIN_ROOT:-.}/dist/index.js"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Check if core engine exists
if [ ! -f "$CORE_CLI" ]; then
    exit 0
fi

# Log the interruption via pipeline CLI
HAM_PROJECT_DIR="$PROJECT_DIR" node "$CORE_CLI" pipeline log "session ended - marking as interrupted" 2>/dev/null

# Mark pipeline as interrupted via CLI (no direct require)
HAM_PROJECT_DIR="$PROJECT_DIR" node "$CORE_CLI" pipeline mark-interrupted 2>/dev/null

exit 0
