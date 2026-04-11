#!/bin/bash
# ham-autocode v2.0 PostToolUse Hook
# Tracks context budget after each tool use.
# Only runs if pipeline is active to avoid overhead.

CORE_CLI="${CLAUDE_PROJECT_DIR:-.}/core/index.js"

# Check if core engine exists
if [ ! -f "$CORE_CLI" ]; then
    exit 0
fi

# Quick check: is pipeline running?
PIPELINE_STATUS=$(node "$CORE_CLI" pipeline status 2>/dev/null)
if [ $? -ne 0 ]; then
    exit 0
fi

# Check budget level
BUDGET=$(node "$CORE_CLI" context budget 2>/dev/null)
if [ -z "$BUDGET" ]; then
    exit 0
fi

LEVEL=$(echo "$BUDGET" | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const b = JSON.parse(chunks.join(''));
    process.stdout.write(b.level || 'ok');
  } catch { process.stdout.write('ok'); }
});
")

# Only emit warning for non-ok levels
if [ "$LEVEL" = "ok" ]; then
    exit 0
fi

# Emit context budget warning
node -e "
const level = '$LEVEL';
const warnings = {
  advisory: 'Context budget reaching advisory threshold (30%). Consider prioritizing remaining tasks.',
  compress: 'Context budget at compress threshold (50%). Recommend compressing context or delegating to subagent.',
  critical: 'Context budget CRITICAL (70%+). Delegate heavy work to subagents immediately.',
};
const msg = warnings[level] || '';
if (msg) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: '⚠️ ' + msg,
    }
  }));
}
" 2>/dev/null
