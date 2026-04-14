#!/bin/bash
# ham-autocode v3.3 PostToolUse Hook — fast exit path
# Only starts Node process when budget file exists AND consumed > threshold.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
BUDGET_FILE="$PROJECT_DIR/.ham-autocode/context/budget.json"

# Fast exit: no pipeline = nothing to track
if [ ! -f "$PROJECT_DIR/.ham-autocode/pipeline.json" ]; then
    exit 0
fi

# Fast exit: no budget file = budget never consumed
if [ ! -f "$BUDGET_FILE" ]; then
    exit 0
fi

# Fast exit: check consumed value without starting Node
# Budget file is small JSON: {"consumed":NNN,...}
# Use grep to extract consumed value
CONSUMED=$(grep -o '"consumed":[0-9]*' "$BUDGET_FILE" 2>/dev/null | grep -o '[0-9]*')
if [ -z "$CONSUMED" ] || [ "$CONSUMED" -lt 30 ]; then
    exit 0
fi

# Only reach here when budget is actually significant — start Node
CORE_CLI="${CLAUDE_PLUGIN_ROOT:-.}/dist/index.js"
if [ ! -f "$CORE_CLI" ]; then
    exit 0
fi

LEVEL=$(HAM_PROJECT_DIR="$PROJECT_DIR" node "$CORE_CLI" context budget 2>/dev/null | node -e "
let c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
try{process.stdout.write(JSON.parse(c.join('')).level||'ok')}catch{process.stdout.write('ok')}});" 2>/dev/null)

if [ "$LEVEL" = "critical" ]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"WARNING: Context budget CRITICAL. Compress or start new session."}}'
elif [ "$LEVEL" = "compress" ]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"NOTICE: Context budget high. Consider summarizing."}}'
fi

exit 0
