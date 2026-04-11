#!/bin/bash
# ============================================================
# ham-autocode Auto-Orchestrator
#
# Uses claude -p (headless mode) with --resume to chain skills
# in a single persistent session. This solves the "skill gap"
# problem — phases auto-connect through session continuity.
#
# Features:
# - Chains all 6 phases via headless mode
# - Single session ID for the entire pipeline
# - Auto-resumes on crash (watchdog mode)
# - Reads pipeline.json to skip completed phases
#
# Usage:
#   bash scripts/auto-orchestrator.sh "project description"
#   WATCHDOG=true bash scripts/auto-orchestrator.sh "project description"
#
# Prerequisites:
#   - claude code v2.1.32+
#   - ham-autocode plugin loaded (--plugin-dir or installed)
# ============================================================

set -euo pipefail

PROJECT_DESC="${1:-}"
LOG_DIR=".ham-autocode/logs"
PIPELINE_FILE=".ham-autocode/pipeline.json"
SESSION_FILE=".ham-autocode/session_id"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$LOG_DIR" ".ham-autocode"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_DIR/orchestrator_${TIMESTAMP}.log"
}

# ============================================================
# Get or create session ID (for --resume continuity)
# ============================================================
get_session_id() {
    if [ -f "$SESSION_FILE" ]; then
        cat "$SESSION_FILE"
    else
        echo ""
    fi
}

save_session_id() {
    echo "$1" > "$SESSION_FILE"
}

# ============================================================
# Run claude -p and capture session ID
# ============================================================
run_claude() {
    local prompt="$1"
    local session_id=$(get_session_id)
    local resume_flag=""

    if [ -n "$session_id" ]; then
        resume_flag="--resume $session_id"
    fi

    log "Sending: ${prompt:0:80}..."

    # Run headless, capture JSON output for session_id
    local result
    result=$(claude -p "$prompt" \
        $resume_flag \
        --output-format json \
        --allowedTools "Read,Write,Edit,Bash,Glob,Grep,Agent,Skill,WebSearch,WebFetch" \
        --max-turns 50 \
        2>>"$LOG_DIR/orchestrator_${TIMESTAMP}.log")

    # Extract and save session ID for continuity
    local new_session_id
    new_session_id=$(echo "$result" | jq -r '.session_id // empty' 2>/dev/null)

    if [ -n "$new_session_id" ]; then
        save_session_id "$new_session_id"
        log "Session: $new_session_id"
    fi

    # Extract text result
    echo "$result" | jq -r '.result // empty' 2>/dev/null

    return 0
}

# ============================================================
# Check pipeline state to skip completed phases
# ============================================================
get_current_phase() {
    if [ -f "$PIPELINE_FILE" ]; then
        # Find first phase that is not "done"
        for i in 1 2 3 4 5 6; do
            local phase_status
            phase_status=$(jq -r ".phases.\"$i\".status // \"pending\"" "$PIPELINE_FILE" 2>/dev/null)
            if [ "$phase_status" != "done" ] && [ "$phase_status" != "skipped" ]; then
                echo "$i"
                return
            fi
        done
        echo "7"  # All done
    else
        echo "1"
    fi
}

# ============================================================
# Main Pipeline
# ============================================================
main() {
    log "=========================================="
    log "ham-autocode Auto-Orchestrator"
    log "Project: ${PROJECT_DESC}"
    log "=========================================="

    local start_phase=$(get_current_phase)
    log "Starting from Phase $start_phase"

    # Phase 1: Initiation
    if [ "$start_phase" -le 1 ]; then
        log "=== Phase 1: Project Initiation ==="
        run_claude "Run /ham-autocode:auto for this project: ${PROJECT_DESC}. Start with Phase 1 (initiation). Run /office-hours and /plan-ceo-review. Update .ham-autocode/pipeline.json after each step."
    fi

    # Phase 2: Requirements
    if [ "$start_phase" -le 2 ]; then
        log "=== Phase 2: Requirements ==="
        run_claude "Continue the pipeline. Phase 1 is done. Now run Phase 2: /gsd:new-project and /gsd:new-milestone. Update pipeline.json."
    fi

    # Phase 3: Planning
    if [ "$start_phase" -le 3 ]; then
        log "=== Phase 3: Planning ==="
        run_claude "Continue the pipeline. Phase 2 is done. Now run Phase 3: for each phase in the roadmap, run /gsd:discuss-phase --auto and /gsd:plan-phase. Update pipeline.json."
    fi

    # Phase 4: Execution
    if [ "$start_phase" -le 4 ]; then
        log "=== Phase 4: Execution ==="
        run_claude "Continue the pipeline. Phase 3 is done. Now run Phase 4: /gsd:autonomous to execute all phases. Update pipeline.json periodically."
    fi

    # Phase 5: Review
    if [ "$start_phase" -le 5 ]; then
        log "=== Phase 5: Review ==="
        run_claude "Continue the pipeline. Phase 4 is done. Now run Phase 5: /gsd:verify-work, /review, /qa. Fix all CRITICAL/HIGH issues. Update pipeline.json."
    fi

    # Phase 6: Ship
    if [ "$start_phase" -le 6 ]; then
        log "=== Phase 6: Ship ==="
        run_claude "Continue the pipeline. Phase 5 is done. Now run Phase 6: /ship, /document-release. Update pipeline.json status to completed."
    fi

    log "=========================================="
    log "Pipeline Complete"
    log "=========================================="
}

# ============================================================
# Watchdog: auto-restart on crash
# ============================================================
if [ "${WATCHDOG:-false}" = "true" ]; then
    MAX_RETRIES=5
    RETRY_COUNT=0
    RETRY_DELAY=30

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        log "Watchdog: Attempt $((RETRY_COUNT + 1)) of $MAX_RETRIES"

        if main; then
            log "Watchdog: Completed successfully"
            exit 0
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            log "Watchdog: Crashed. Checking pipeline state..."

            # Check what phase we're at after crash
            CURRENT=$(get_current_phase)
            if [ "$CURRENT" -ge 7 ]; then
                log "Watchdog: Pipeline already complete despite crash"
                exit 0
            fi

            log "Watchdog: Will resume from Phase $CURRENT in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
            RETRY_DELAY=$((RETRY_DELAY * 2))  # Exponential backoff
        fi
    done

    log "Watchdog: Max retries exceeded"
    exit 1
else
    main
fi
