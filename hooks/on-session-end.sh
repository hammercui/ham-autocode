#!/bin/bash
# ham-autocode SessionEnd Hook
# Marks running pipeline as "interrupted" when session ends unexpectedly.

PIPELINE_FILE="${CLAUDE_PROJECT_DIR:-.}/.ham-autocode/pipeline.json"

if [ ! -f "$PIPELINE_FILE" ]; then
    exit 0
fi

# Use node for Windows compatibility
node -e "
const fs = require('fs');
try {
    const d = JSON.parse(fs.readFileSync('$PIPELINE_FILE', 'utf8'));
    if (d.status === 'running') {
        const now = new Date().toISOString();
        d.status = 'interrupted';
        d.interrupted_at = now;
        d.log = d.log || [];
        d.log.push({ time: now, action: 'session ended while pipeline was running - marked as interrupted' });
        fs.writeFileSync('$PIPELINE_FILE', JSON.stringify(d, null, 2), 'utf8');
    }
} catch(e) { /* silent */ }
" 2>/dev/null

exit 0
