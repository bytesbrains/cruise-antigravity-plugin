---
name: cruise-setup
description: >-
  Use this skill when onboarding, configuring, or verifying BytesBrains Cruise in Antigravity IDE or the agy CLI.
  Walks through configuring CRUISE_API_KEY and CRUISE_BASE_URL, rehearsing on the free demo environment,
  and testing MCP tool connectivity without exposing credentials.
---

# Cruise Setup & Verification Runbook

Follow this interactive workflow to configure and verify the Cruise plugin in Antigravity IDE and the `agy` CLI.

## 1. Credential Security Invariants

> [!IMPORTANT]
> **Zero Credential Persistence:**
> - Never write `CRUISE_API_KEY` into project files, `.agents/plugins/`, workspace settings, or git-tracked repositories.
> - Keep keys strictly in your shell environment, keychain, or private secret store.
> - If a key is pasted into the chat session, never echo or persist it.

---

## 2. Interactive Onboarding & Environment Setup

### Step 1: Pre-Flight Key Inspection
Check if the API key is already configured in the environment without exposing its value:

```sh
test -n "$CRUISE_API_KEY" && echo "CRUISE_API_KEY is configured" || echo "CRUISE_API_KEY is missing"
```

If missing, obtain a key from the Cruise dashboard (or organization administrator).

### Step 2: Rehearsal Demo Verification (Recommended)
Before consuming production quotas, rehearse on the free Cruise demo environment with a `cru_demo_` key:

```sh
# 1. Export demo base URL and rehearsal key
export CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net"
export CRUISE_API_KEY="cru_demo_..."

# 2. Verify demo endpoint connectivity
curl -s "${CRUISE_BASE_URL}/v1/models" -H "Authorization: Bearer ${CRUISE_API_KEY}"
```

Confirm that the demo catalogue responds with HTTP 200 and available demo lanes.

### Step 3: Production Configuration
Once demo connectivity is verified, switch to production:

```sh
# Remove demo override (defaults to https://cruise.bytesbrains.net)
unset CRUISE_BASE_URL

# Set live virtual key
export CRUISE_API_KEY="cru_live_..."
```

Add these exports to your shell profile (`~/.zshrc`, `~/.bashrc`) or secret manager so new Antigravity sessions inherit them.

---

## 3. Plugin Registration

### Option A: Workspace Project Discovery
Place or submodule the plugin in your project's customization root:
```sh
mkdir -p .agents/plugins
git clone https://github.com/bytesbrains/cruise-antigravity-plugin.git .agents/plugins/cruise
```

### Option B: Explicit Inclusion (`plugins.json`)
If the plugin is located outside the workspace, reference it in `.agents/plugins.json`:
```json
{
  "entries": [
    {
      "path": "path/to/cruise-antigravity-plugin/plugins"
    }
  ]
}
```

---

## 4. BYOK Inference Endpoint Configuration

Configure Antigravity's inference client to route requests through Cruise's OpenAI-compatible gateway:

1. **Base URL**: `${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1`
2. **Authorization**: `Bearer ${CRUISE_API_KEY}`
3. **Default Model Lane**: `bb/agentic-coding`

---

## 5. Verification & Health Checks

Run through this verification sequence to confirm end-to-end operation:

1. **Verify Environment Variables**:
   ```sh
   test -n "$CRUISE_API_KEY" && echo "Ready: CRUISE_API_KEY is set"
   ```

2. **Verify MCP Tools**:
   Check that the agent can invoke the 3 Cruise MCP tools defined in `plugins/cruise/mcp_config.json`:
   - `list_models`: Returns available lanes (`bb/agentic-coding`, `bb/chat-assistant`, `bb/extraction`, `bb/fast`) and member models.
   - `get_budget`: Confirms project spend, budget cap, and `action` status (`serve` vs `refuse`).
   - `get_spend`: Queries settled cost ledger records for the current or specified calendar month.

3. **Smoke Test Request**:
   Send a lightweight catalogue request to verify bearer authentication:
   ```sh
   curl -s "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1/models" \
     -H "Authorization: Bearer ${CRUISE_API_KEY}"
   ```

---

## 6. Troubleshooting Common Issues

| Error / Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| **HTTP 401 "Incorrect API key provided"** | `CRUISE_API_KEY` is empty, expired, or a `cru_demo_` key was sent to production (or `cru_live_` to demo). | Verify key prefix against `CRUISE_BASE_URL`. Ensure key is exported in the shell before launching Antigravity. |
| **HTTP 403 "Permission denied"** | Key lacks access to the requested model or lane. | Call `list_models` via MCP to inspect allowed lanes for the key. |
| **HTTP 429 "budget_exhausted"** | Period project budget cap reached. | Inspect `get_budget`. Cap will reset at the period boundary, or increase cap in dashboard. |
| **HTTP 402 "wallet_exhausted"** | Organization prepaid wallet is depleted. | Non-transient. Replenish funds or obtain credit grant; do not retry in a loop. |
| **MCP server not responding** | Plugin not enabled or `mcp_config.json` failed to load. | Check `mcp_config.json` syntax and verify plugin is enabled in `~/.gemini/config.json`. |
