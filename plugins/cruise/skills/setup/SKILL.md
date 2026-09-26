---
name: cruise-setup
description: >-
  Use this skill when onboarding, configuring, or verifying BytesBrains Cruise in Antigravity IDE or the agy CLI,
  or when the user invokes /cruise-setup. Guides interactive credential collection, live validation against /v1/models,
  automated settings.json CLI configuration, rehearsal verification, and MCP connectivity checks.
---

# Cruise Setup & Interactive Onboarding Runbook

Follow this interactive workflow when configuring and verifying the Cruise plugin in Antigravity IDE and the `agy` CLI, or when `/cruise-setup` is invoked.

## 1. Credential Security Invariants

> [!IMPORTANT]
> **Zero Credential Persistence:**
> - Never write `CRUISE_API_KEY` into project files, `.agents/plugins/`, workspace settings, or git-tracked repositories.
> - In `~/.gemini/antigravity-cli/settings.json`, always store `"openaiApiKey": "${CRUISE_API_KEY}"` using environment variable expansion — never persist the literal key to disk.
> - Keep keys strictly in your shell environment, keychain, or private secret store.
> - If a key is provided in a session, use it only for memory/validation and guide the user on adding it to their shell profile (`~/.zshrc` / `~/.bashrc`). Never echo or persist it in chat history or code files.

---

## 2. Interactive `/cruise-setup` Onboarding Wizard

When the user triggers `/cruise-setup` or requests Cruise configuration, execute the following step-by-step interactive workflow:

### Step 1: Prompt for Credentials & Base URL
1. Check if `CRUISE_API_KEY` is already present in the active environment:
   ```sh
   test -n "$CRUISE_API_KEY" && echo "CRUISE_API_KEY is configured" || echo "CRUISE_API_KEY is missing"
   ```
2. Prompt the user for:
   - **Cruise API Key**: Must start with `cru_live_...` (production) or `cru_demo_...` (free rehearsal). Reject raw upstream provider keys (`sk-...`, `AIza...`).
   - **Cruise Base URL**: Defaults to `https://cruise.bytesbrains.net`. For free rehearsal sandbox testing, use `https://cruise-demo.bytesbrains.net`.

### Step 2: Live Credential Validation Probe
Before persisting settings, send an authenticated probe to verify key validity and network reachability:

```sh
curl -s -f "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1/models" \
  -H "Authorization: Bearer ${CRUISE_API_KEY}"
```

- **HTTP 200**: Credentials valid. Proceed to configuration. The response returns available virtual lanes (`bb/agentic-coding`, `bb/chat-assistant`, `bb/extraction`, `bb/fast`).
- **HTTP 401**: Unauthorized. Invalid API key or environment mismatch (e.g. `cru_demo_` against production endpoint, or `cru_live_` against demo). Request key re-entry.
- **HTTP 403**: Forbidden. Key lacks access permissions for the requested model catalogue.
- **Connection Error**: Check Base URL formatting and network firewall rules.

### Step 3: Automated CLI Configuration (`settings.json`)
Automatically write or update `~/.gemini/antigravity-cli/settings.json` to route `agy` sessions through the Cruise gateway:

```json
{
  "modelProvider": "openai",
  "openaiBaseUrl": "<CRUISE_BASE_URL>/v1",
  "openaiApiKey": "${CRUISE_API_KEY}",
  "model": "bb/agentic-coding"
}
```

*Note: `<CRUISE_BASE_URL>` resolves to `https://cruise.bytesbrains.net` (or the custom URL entered in Step 1). Do not include a trailing slash.*

### Step 4: Automated Antigravity IDE Settings UI Configuration
Automatically configure custom provider settings in Antigravity IDE (`~/.gemini/settings.json` or workspace `.gemini/settings.json` / `.vscode/settings.json`):

```json
{
  "antigravity.ai.customProviders": [
    {
      "name": "BytesBrains Cruise",
      "baseUrl": "<CRUISE_BASE_URL>/v1",
      "apiKey": "${env:CRUISE_API_KEY}",
      "models": [
        "bb/agentic-coding",
        "bb/chat-assistant",
        "bb/extraction",
        "bb/fast"
      ]
    }
  ]
}
```

- **Settings UI Accessibility**: Registers cleanly in the graphical Settings UI under **Settings > AI Models > Custom Provider**.
- **Model Selector Dropdown**: Registered virtual lanes (`bb/agentic-coding`, `bb/chat-assistant`, `bb/extraction`, `bb/fast`) appear directly in the IDE chat dropdown selector.
- **Zero-Secret Invariant**: Uses `${env:CRUISE_API_KEY}` dynamic environment variable expansion — never persists raw API keys to disk.

### Step 5: Shell Profile Export Guidance
Instruct the user to export their key in their shell startup profile so every new terminal session and IDE process inherits the credentials:

- **Zsh (`~/.zshrc`)**:
  ```sh
  export CRUISE_API_KEY="cru_live_..."
  # If using non-default base URL:
  # export CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net"
  ```
  Reload: `source ~/.zshrc`

- **Bash (`~/.bashrc`)**:
  ```sh
  export CRUISE_API_KEY="cru_live_..."
  # If using non-default base URL:
  # export CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net"
  ```
  Reload: `source ~/.bashrc`

### Step 6: Executing via Bundled Setup Helper
Alternatively, invoke the automated TypeScript / Bash setup wizard directly:

```sh
# Via Node.js / tsx
node plugins/cruise/skills/setup/scripts/setup.ts

# Via Bash launcher script
./plugins/cruise/skills/setup/scripts/setup.sh

# Automated setup for CLI and IDE (interactive wizard)
npm run setup

# Standalone IDE custom provider auto-configuration
npm run setup:ide
```

---

## 3. Rehearsal Demo Verification (Recommended)

Before consuming production quotas, rehearse on the free Cruise demo environment with a `cru_demo_` key:

```sh
# 1. Export demo base URL and rehearsal key
export CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net"
export CRUISE_API_KEY="cru_demo_..."

# 2. Verify demo endpoint connectivity
curl -s "${CRUISE_BASE_URL}/v1/models" -H "Authorization: Bearer ${CRUISE_API_KEY}"
```

Confirm that the demo catalogue responds with HTTP 200 and available demo lanes (`bb/agentic-coding`, `bb/chat-assistant`, `bb/extraction`, `bb/fast`).

Once verified, switch to live production by unsetting `CRUISE_BASE_URL` and exporting your `cru_live_...` key.

---

## 4. Plugin Registration

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

## 5. BYOK Inference Endpoint Configuration

Configure Antigravity's inference client to route requests through Cruise's OpenAI-compatible gateway:

1. **Base URL**: `${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1`
2. **Authorization**: `Bearer ${CRUISE_API_KEY}`
3. **Default Model Lane**: `bb/agentic-coding`

---

## 6. Verification & Health Checks

Run through this verification sequence to confirm end-to-end operation:

1. **Verify Environment Variables**:
   ```sh
   test -n "$CRUISE_API_KEY" && echo "Ready: CRUISE_API_KEY is set"
   ```

2. **Verify MCP Tools**:
   Check that the agent can invoke the 3 Cruise MCP tools defined in [mcp_config.json](../../mcp_config.json):
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

## 7. Troubleshooting Common Issues

| Error / Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| **HTTP 401 "Incorrect API key provided"** | `CRUISE_API_KEY` is empty, expired, or a `cru_demo_` key was sent to production (or `cru_live_` to demo). | Verify key prefix against `CRUISE_BASE_URL`. Ensure key is exported in the shell before launching Antigravity. |
| **HTTP 403 "Permission denied"** | Key lacks access to the requested model or lane. | Call `list_models` via MCP to inspect allowed lanes for the key. |
| **HTTP 429 "budget_exhausted"** | Period project budget cap reached. | Inspect `get_budget`. Cap will reset at the period boundary, or increase cap in dashboard. |
| **HTTP 402 "wallet_exhausted"** | Organization prepaid wallet is depleted. | Non-transient. Replenish funds or obtain credit grant; do not retry in a loop. |
| **MCP server not responding** | Plugin not enabled or `mcp_config.json` failed to load. | Check `mcp_config.json` syntax and verify plugin is enabled in `~/.gemini/config.json`. |
