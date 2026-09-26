#!/usr/bin/env bash
# BytesBrains Cruise — Antigravity Setup CLI Wizard Launcher
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

# Prioritize local project tsx runner, then global tsx, then npx tsx, then node
if [ -x "$ROOT_DIR/node_modules/.bin/tsx" ]; then
  exec "$ROOT_DIR/node_modules/.bin/tsx" "$SCRIPT_DIR/setup.ts" "$@"
elif command -v tsx >/dev/null 2>&1; then
  exec tsx "$SCRIPT_DIR/setup.ts" "$@"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes tsx "$SCRIPT_DIR/setup.ts" "$@"
elif command -v node >/dev/null 2>&1; then
  exec node "$SCRIPT_DIR/setup.ts" "$@"
else
  echo "❌ Error: Node.js (>=22) or tsx is required to run the Cruise setup wizard." >&2
  echo "Please install Node.js and run: npm run setup" >&2
  exit 1
fi
