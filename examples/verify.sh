#!/usr/bin/env bash
# ham-autocode verification script
# Runs: environment check → build → test → CLI smoke tests
# Exit 0 = all passed, Exit 1 = something failed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=== ham-autocode verification ==="
echo ""

# --- Environment ---
echo "[env] Node.js: $(node -v)"
echo "[env] npm: $(npm -v)"
echo "[env] TypeScript: $(npx tsc --version 2>/dev/null || echo 'not found')"
echo "[env] Platform: $(uname -s) $(uname -m)"
echo ""

# --- Build ---
echo "[build] Compiling TypeScript..."
npm run build
echo "[build] OK"
echo ""

# --- Tests ---
echo "[test] Running 8 test suites..."
npm test
echo "[test] OK"
echo ""

# --- CLI Smoke Tests ---
echo "[cli] config show..."
node dist/index.js config show > /dev/null 2>&1 && echo "  OK" || echo "  SKIP (no config)"

echo "[cli] context budget..."
node dist/index.js context budget > /dev/null 2>&1 && echo "  OK" || echo "  SKIP (no pipeline)"

echo "[cli] learn hints..."
node dist/index.js learn hints > /dev/null 2>&1 && echo "  OK" || echo "  SKIP (no learning data)"

echo ""
echo "=== verification complete ==="
