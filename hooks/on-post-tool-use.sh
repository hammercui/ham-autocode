#!/bin/bash
# ham-autocode v2.0 PostToolUse Hook
# Uses core engine CLI to track context budget after each tool use.

CORE_CLI="${CLAUDE_PROJECT_DIR:-.}/dist/index.js"

# Check if core engine exists
if [ ! -f "$CORE_CLI" ]; then
    exit 0
fi

# Track context budget - estimate tokens consumed by tool output
BUDGET_STATUS=$(node "$CORE_CLI" context budget 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$BUDGET_STATUS" ]; then
    exit 0
fi

# Check if budget is at compress or critical level (Windows-compatible: no /dev/stdin)
LEVEL=$(echo "$BUDGET_STATUS" | node -e "
let chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(chunks.join(''));
    process.stdout.write(data.level || 'ok');
  } catch { process.stdout.write('ok'); }
});
" 2>/dev/null)

if [ "$LEVEL" = "critical" ]; then
    CONTEXT='{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"WARNING: Context budget is CRITICAL. Consider compressing context or starting a new session."}}'
    echo "$CONTEXT"
elif [ "$LEVEL" = "compress" ]; then
    CONTEXT='{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"NOTICE: Context budget is high. Consider summarizing completed work."}}'
    echo "$CONTEXT"
fi

exit 0
