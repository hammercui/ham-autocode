#!/bin/bash
# ham-autocode SessionStart Hook
# Injects pipeline state as context on session start.

PIPELINE_FILE="${CLAUDE_PROJECT_DIR:-.}/.ham-autocode/pipeline.json"

if [ ! -f "$PIPELINE_FILE" ]; then
    exit 0
fi

# Use node (more reliable on Windows than python3)
CONTEXT=$(node -e "
const fs = require('fs');
try {
    const d = JSON.parse(fs.readFileSync('$PIPELINE_FILE', 'utf8'));
    const status = d.status || '?';
    const phase = d.current_phase || '?';
    const step = d.current_step || '?';
    const project = d.project || '?';
    const summary = 'ham-autocode pipeline: project=' + project + ', status=' + status + ', phase=' + phase + ', step=' + step;
    const state = JSON.stringify(d, null, 2);
    const ctx = '## ham-autocode Pipeline State\\n\\n' + summary + '\\n\\nFull state:\\n\`\`\`json\\n' + state + '\\n\`\`\`\\n\\nUse /ham-autocode:status to see progress.\\nUse /ham-autocode:resume to continue.\\nUse /ham-autocode:pause to save and stop.';
    const output = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } };
    process.stdout.write(JSON.stringify(output));
} catch(e) {
    process.exit(0);
}
" 2>/dev/null)

if [ -n "$CONTEXT" ]; then
    echo "$CONTEXT"
else
    exit 0
fi
