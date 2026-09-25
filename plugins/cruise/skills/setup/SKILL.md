---
name: cruise-setup
description: >-
  Set up, configure, and verify the BytesBrains Cruise plugin for Antigravity,
  including BYOK endpoint configuration, environment variables, and MCP connectivity checks.
---

# Cruise Setup & Verification Runbook

Follow this workflow to configure and verify the Cruise plugin in Antigravity IDE and the `agy` CLI.

## 1. Prerequisites & Environment Setup

Cruise requires an active virtual API key.

1. Ensure `CRUISE_API_KEY` is exported in your environment:
   ```sh
   export CRUISE_API_KEY="cru_live_..."
   ```
2. (Optional) If connecting to an enterprise tenant or rehearsal demo environment:
   ```sh
   export CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net"
   ```
   *Default:* `https://cruise.bytesbrains.net`

> [!IMPORTANT]
> Never write `CRUISE_API_KEY` into project files or settings configs. Keep it strictly in your shell environment or keychain.

---

## 2. Plugin Registration

### Option A: Project Workspace Discovery
Ensure the plugin is mounted inside `.agents/plugins/cruise`:
```sh
mkdir -p .agents/plugins
git clone https://github.com/bytesbrains/cruise-antigravity-plugin.git .agents/plugins/cruise
```

### Option B: Explicit Inclusion (`plugins.json`)
If the repository is checked out elsewhere, register it in your workspace's `.agents/plugins.json`:
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

## 3. BYOK Endpoint Configuration

Point Antigravity's inference client to the Cruise OpenAI-compatible endpoint:

1. Base URL: `${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1`
2. API Key Header: `Authorization: Bearer ${CRUISE_API_KEY}`
3. Default Routing Model: `bb/agentic-coding`

---

## 4. Verification Workflow

Run through this verification checklist to confirm setup:

1. **Verify Environment**:
   ```sh
   if [ -z "$CRUISE_API_KEY" ]; then echo "Missing CRUISE_API_KEY"; else echo "CRUISE_API_KEY is set"; fi
   ```
2. **Verify MCP Tools**:
   Check if the agent has access to Cruise MCP tools:
   - `list_models` — Should list available lanes (`bb/agentic-coding`, `bb/chat-assistant`, etc.)
   - `get_budget` — Should display the active project budget, current spend, and threshold status.
   - `get_spend` — Should display cumulative settled ledger spend for the project.
3. **Smoke Test Request**:
   Perform a simple prompt with the configured lane:
   ```sh
   curl -s "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1/models" \
     -H "Authorization: Bearer ${CRUISE_API_KEY}"
   ```
   Confirm that HTTP 200 is returned with the model catalogue.
