#!/bin/bash
# ham-autocode v2.0 SessionStart Hook
# Uses core engine CLI to inject pipeline state as context.

CORE_CLI="${CLAUDE_PROJECT_DIR:-.}/core/index.js"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Check if core engine exists
if [ ! -f "$CORE_CLI" ]; then
    exit 0
fi

# Check if pipeline exists
PIPELINE_STATUS=$(node "$CORE_CLI" pipeline status 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$PIPELINE_STATUS" ]; then
    exit 0
fi

# Build context from pipeline status + DAG stats + budget
DAG_STATUS=$(node "$CORE_CLI" dag status 2>/dev/null || echo '{}')
BUDGET_STATUS=$(node "$CORE_CLI" context budget 2>/dev/null || echo '{}')

CONTEXT=$(node -e "
const pipeline = $PIPELINE_STATUS;
const dag = $DAG_STATUS;
const budget = $BUDGET_STATUS;

const project = pipeline.project || '?';
const status = pipeline.status || '?';
const task = pipeline.current_task || 'none';
const progress = dag.progress !== undefined ? dag.progress + '%' : '?';
const budgetLevel = budget.level || 'ok';

const summary = [
  'ham-autocode pipeline: project=' + project + ', status=' + status,
  'Current task: ' + task,
  'Progress: ' + progress + ' (' + (dag.done || 0) + '/' + (dag.total || 0) + ' tasks)',
  'Context budget: ' + budgetLevel,
].join('\\n');

const ctx = '## ham-autocode Pipeline State (v2.0)\\n\\n' + summary + '\\n\\nUse /ham-autocode:status for details.\\nUse /ham-autocode:resume to continue.';
const output = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } };
process.stdout.write(JSON.stringify(output));
" 2>/dev/null)

if [ -n "$CONTEXT" ]; then
    echo "$CONTEXT"
else
    exit 0
fi
