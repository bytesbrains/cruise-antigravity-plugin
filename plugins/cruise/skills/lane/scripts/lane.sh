#!/usr/bin/env bash
# BytesBrains Cruise — Model Lane Discovery & Selection Launcher
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

# Prioritize local project tsx runner, then global tsx, then npx tsx, then node
if [ -x "$ROOT_DIR/node_modules/.bin/tsx" ]; then
  exec "$ROOT_DIR/node_modules/.bin/tsx" "$SCRIPT_DIR/lane.ts" "$@"
elif command -v tsx >/dev/null 2>&1; then
  exec tsx "$SCRIPT_DIR/lane.ts" "$@"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes tsx "$SCRIPT_DIR/lane.ts" "$@"
elif command -v node >/dev/null 2>&1; then
  exec node "$SCRIPT_DIR/lane.ts" "$@"
else
  echo "❌ Error: Node.js (>=22) or tsx is required to inspect Cruise model lanes." >&2
  echo "Please install Node.js and run: npm run lanes" >&2
  exit 1
fi
