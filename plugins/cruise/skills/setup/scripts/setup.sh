#!/usr/bin/env bash
# BytesBrains Cruise — Antigravity Setup CLI Wizard
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# If Node.js is available, delegate to the comprehensive TypeScript setup script
if command -v node >/dev/null 2>&1; then
  exec node "$SCRIPT_DIR/setup.ts" "$@"
fi

# Fallback: Bash-native interactive wizard
echo "=================================================="
echo "   BytesBrains Cruise — Antigravity Setup Wizard  "
echo "=================================================="
echo

DEFAULT_BASE_URL="https://cruise.bytesbrains.net"
CRUISE_BASE_URL="${CRUISE_BASE_URL:-$DEFAULT_BASE_URL}"

read -r -p "Enter Cruise Base URL [default: $DEFAULT_BASE_URL]: " USER_URL
if [ -n "$USER_URL" ]; then
  CRUISE_BASE_URL="$USER_URL"
fi
CRUISE_BASE_URL="${CRUISE_BASE_URL%/}"
CRUISE_BASE_URL="${CRUISE_BASE_URL%/v1}"

if [ -n "${CRUISE_API_KEY:-}" ]; then
  echo "Found existing CRUISE_API_KEY in environment."
  read -r -p "Press Enter to use existing key, or paste a new key: " USER_KEY
  if [ -n "$USER_KEY" ]; then
    CRUISE_API_KEY="$USER_KEY"
  fi
else
  read -r -p "Enter your Cruise API key (cru_live_... or cru_demo_...): " CRUISE_API_KEY
fi

if [ -z "${CRUISE_API_KEY:-}" ]; then
  echo "❌ Error: API key cannot be empty. Setup aborted." >&2
  exit 1
fi

# Prefix validation
if [[ ! "$CRUISE_API_KEY" =~ ^cru_(live|demo|test|svc)_ ]]; then
  echo "❌ Error: Invalid key format. Key must start with cru_live_ or cru_demo_." >&2
  exit 1
fi

echo
echo "Validating credentials against ${CRUISE_BASE_URL}/v1/models..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${CRUISE_API_KEY}" "${CRUISE_BASE_URL}/v1/models" || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Credentials verified successfully!"
elif [ "$HTTP_STATUS" = "401" ]; then
  echo "❌ HTTP 401 Unauthorized: Invalid API key or environment mismatch." >&2
  exit 1
elif [ "$HTTP_STATUS" = "403" ]; then
  echo "❌ HTTP 403 Forbidden: Key lacks access to /v1/models." >&2
  exit 1
else
  echo "⚠️ Warning: Validation returned HTTP ${HTTP_STATUS}." >&2
  read -r -p "Do you still want to persist configuration? (y/N): " PROCEED
  if [[ ! "$PROCEED" =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

SETTINGS_DIR="${HOME}/.gemini/antigravity-cli"
SETTINGS_FILE="${SETTINGS_DIR}/settings.json"
mkdir -p "$SETTINGS_DIR"

# Write or update settings.json
if [ -f "$SETTINGS_FILE" ] && command -v jq >/dev/null 2>&1; then
  jq --arg base "${CRUISE_BASE_URL}/v1" \
     '.modelProvider = "openai" | .openaiBaseUrl = $base | .openaiApiKey = "${CRUISE_API_KEY}" | .model = "bb/agentic-coding"' \
     "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
else
  cat <<EOF > "$SETTINGS_FILE"
{
  "modelProvider": "openai",
  "openaiBaseUrl": "${CRUISE_BASE_URL}/v1",
  "openaiApiKey": "\${CRUISE_API_KEY}",
  "model": "bb/agentic-coding"
}
EOF
fi

echo "✅ Settings successfully saved to: ${SETTINGS_FILE}"
echo
echo "--------------------------------------------------"
echo "Shell Environment Configuration:"
echo "--------------------------------------------------"
PROFILE_FILE="~/.zshrc"
if [ -n "${BASH_VERSION:-}" ] || [ "${SHELL:-}" = "*/bash" ]; then
  PROFILE_FILE="~/.bashrc"
fi
echo "Add the following export to your ${PROFILE_FILE}:"
echo
echo "export CRUISE_API_KEY=\"${CRUISE_API_KEY}\""
if [ "$CRUISE_BASE_URL" != "$DEFAULT_BASE_URL" ]; then
  echo "export CRUISE_BASE_URL=\"${CRUISE_BASE_URL}\""
fi
echo
echo "Then reload your shell profile: source ${PROFILE_FILE}"
echo "--------------------------------------------------"
