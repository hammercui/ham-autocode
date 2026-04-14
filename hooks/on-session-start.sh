#!/bin/bash
# ham-autocode v3.3 SessionStart Hook — single CLI call
# Reduced from 3 Node calls to 1.

CORE_CLI="${CLAUDE_PLUGIN_ROOT:-.}/dist/index.js"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Fast exit: no core engine
if [ ! -f "$CORE_CLI" ]; then
    exit 0
fi

# Fast exit: no pipeline
if [ ! -f "$PROJECT_DIR/.ham-autocode/pipeline.json" ]; then
    exit 0
fi

# Single call returns compact context string
CTX=$(HAM_PROJECT_DIR="$PROJECT_DIR" node "$CORE_CLI" session context 2>/dev/null)
if [ -z "$CTX" ]; then
    exit 0
fi

OUTPUT="{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"$CTX\"}}"
echo "$OUTPUT"
