#!/usr/bin/env bash
# ham-autocode project bootstrap — Anthropic-style init script.
# Any agent can run this once per session to verify the environment is ready.
#
# Idempotent: safe to run repeatedly.

set -e

cd "$(dirname "$0")/../.."

echo "[init] node: $(node -v)"
echo "[init] npm:  $(npm -v)"

if [ ! -d node_modules ]; then
  echo "[init] installing dependencies..."
  npm install --silent
fi

if [ ! -d dist ]; then
  echo "[init] building..."
  npm run build --silent
fi

# Migrate legacy layout if present (pre-v4.1 .ham-autocode/tasks, .planning/, etc.)
if [ -d .planning ] || [ -d .ham-autocode/tasks ] || [ -d .ham-autocode/logs ]; then
  echo "[init] legacy layout detected — running migrate..."
  node dist/index.js migrate
fi

echo "[init] ready. entry point: .ham-autocode/INDEX.md"
