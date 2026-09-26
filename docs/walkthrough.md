# Antigravity Cruise Plugin Walkthrough & Usage Guide

This walkthrough guides you through installing, configuring, and using the official **BytesBrains Cruise** plugin with **Google Antigravity** (IDE, CLI `agy`, and Antigravity 2.0).

---

## 1. Quickstart Installation

Antigravity discovers plugins either at the workspace level (for project-specific isolation) or at the user level (globally across all projects).

### Workspace Installation (`.agents/plugins/cruise`)

To equip a specific project with Cruise routing and MCP tools, clone this repository directly into your project's `.agents/plugins/` directory:

```sh
# Navigate to your project repository root
cd /path/to/your/project

# Create the plugins directory if it does not exist
mkdir -p .agents/plugins

# Clone the plugin
git clone https://github.com/bytesbrains/cruise-antigravity-plugin.git .agents/plugins/cruise
```

Once cloned, Antigravity automatically detects `plugins/cruise/plugin.json` and loads the skill runbooks, operational rules (`AGENTS.md`), and MCP client tools upon startup.

### Global Installation (`~/.gemini/config/plugins/cruise`)

To make Cruise available across all workspaces and CLI sessions on your machine:

```sh
# Create the global user configuration plugins directory
mkdir -p ~/.gemini/config/plugins

# Clone the plugin globally
git clone https://github.com/bytesbrains/cruise-antigravity-plugin.git ~/.gemini/config/plugins/cruise
```

### Alternative Discovery (`plugins.json`)

If your project manages plugins centrally via a manifest file, add an entry to your workspace `.agents/plugins.json`:

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

## 2. Environment Configuration

The Cruise plugin reads your API credentials dynamically from the runtime environment.

### Setting Your Credentials

Export your Cruise API key in your shell profile (`~/.zshrc`, `~/.bashrc`, or project `.envrc`):

```sh
# Production live key
export CRUISE_API_KEY="cru_live_..."

# Optional: Override base URL (defaults to https://cruise.bytesbrains.net)
# export CRUISE_BASE_URL="https://cruise.bytesbrains.net"
```

### Zero-Cost Rehearsal (Demo Environment)

To test tool execution, lane discovery, and prompts without consuming production funds:

```sh
export CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net"
export CRUISE_API_KEY="cru_demo_..."
```

> [!IMPORTANT]
> Never commit raw API keys to files, git history, or settings files. The plugin strictly relies on dynamic `${CRUISE_API_KEY}` substitution.

### Automated Antigravity IDE Settings Configuration

You can automatically configure Antigravity IDE to route model completions through Cruise and display virtual lanes in the chat dropdown:

```sh
# Run the automated IDE configuration helper
npm run setup:ide

# Or run the interactive setup wizard (configures both CLI and IDE)
npm run setup
```

This writes or non-destructively updates `~/.gemini/settings.json` (or workspace `.gemini/settings.json`):

```json
{
  "antigravity.ai.customProviders": [
    {
      "name": "BytesBrains Cruise",
      "baseUrl": "https://cruise.bytesbrains.net/v1",
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

- **Settings UI Accessibility**: The provider registers cleanly in the graphical Settings UI under **Settings > AI Models > Custom Provider**.
- **Model Selector Dropdown**: Registered virtual lanes (`bb/agentic-coding`, `bb/chat-assistant`, `bb/extraction`, `bb/fast`) appear directly in the IDE chat dropdown selector.
- **Zero-Secret Invariant**: Uses `${env:CRUISE_API_KEY}` dynamic environment variable expansion — never persists raw API keys to disk.

---

## 3. Example Prompts & Walkthroughs

The Cruise plugin exposes three core MCP tools:
1. `list_models`: Discovers active virtual lanes and model capabilities.
2. `get_spend`: Tracks token usage and spend across billing periods.
3. `get_budget`: Inspects periodic budget caps, reset timestamps, and prepaid wallet balances.

Below are step-by-step example prompts demonstrating how to interact with these tools naturally inside Antigravity sessions.

### A. Querying Model Lanes & Capabilities

Cruise routes traffic through virtual lanes rather than hardcoded snapshots. You can ask Antigravity to explore available lanes, verify member models, and check tool capabilities.

#### Example Prompt:
> *"What model routing lanes are available on Cruise right now, and which ones support tools and streaming?"*

> [!TIP]
> **Slash Command Shortcut**: You can also type `/cruise-lane` or `/cruise-models` to trigger the lane inspection runbook directly, formatting capability matrices, context limits, pricing, and interactive model switching commands (`/model <lane>`, `/effort <level>`).

#### What Happens Under the Hood:
Antigravity invokes the `list_models` MCP tool:
```json
{
  "kind": "lanes"
}
```

#### Expected Agent Output:
The agent inspects `x-cruise.any_member` capabilities and summarizes the response:
- `bb/agentic-coding`: High-capacity lane optimized for complex refactoring, multi-file code generation, and test suites. Members support function calling (`tools: true`) and streaming.
- `bb/chat-assistant`: Balanced lane for interactive pairing and explanations.
- `bb/extraction`: Deterministic parsing lane with strict JSON Schema guarantees.
- `bb/fast`: Ultra-low latency lane for minor edits, lint checks, and summaries.

---

### B. Tracking Spend Across Billing Periods

Monitor token consumption and financial spend to ensure tasks remain within organizational allocations.

#### Example Prompt:
> *"Check how much spend our project has accumulated on Cruise for the active billing period."*

#### What Happens Under the Hood:
Antigravity invokes the `get_spend` MCP tool:
```json
{
  "period": "current"
}
```

#### Expected Agent Output:
The agent returns structured spend analytics:
- **Billing Period**: Current active cycle (e.g., 2026-09-01 to 2026-09-30)
- **Spend (USD)**: `$42.18`
- **Token Breakdown**: `1,840,290` prompt tokens, `412,800` completion tokens
- **Top Lanes**: `bb/agentic-coding` (78%), `bb/chat-assistant` (18%), `bb/fast` (4%)

---

### C. Inspecting Budget Caps & Wallet Balance

Before initiating long-running batch operations or multi-agent workflows, verify your spend limits and reset schedules.

#### Example Prompt:
> *"Inspect our Cruise budget caps and prepaid wallet balance before we run the refactoring sweep."*

#### What Happens Under the Hood:
Antigravity invokes the `get_budget` MCP tool:
```json
{}
```

#### Expected Agent Output:
The agent reports your budget safety envelope:
- **Period Spend Cap**: `$100.00 / month`
- **Period Spend Used**: `$42.18` (`$57.82` remaining)
- **Period Reset**: `2026-10-01T00:00:00Z` (resets in 4 days)
- **Prepaid Wallet Balance**: `$250.00`
- **Status**: Healthy. Ample headroom available for refactoring sweeps.

---

## 4. Multi-Agent & Subagent Pairing Workflows

When using subagents in Antigravity (`self`, `research`, or custom defined agents), pair the task workload with the appropriate virtual lane:

```text
[Parent Coordinator Agent] ─── (bb/agentic-coding)
         │
         ├──► [Research Subagent] ──────── (bb/chat-assistant)
         │    Explores codebase & libraries
         │
         ├──► [Parser Subagent] ────────── (bb/extraction)
         │    Extracts AST metadata to JSON
         │
         └──► [Lint/Format Subagent] ───── (bb/fast)
              Fixes minor formatting & style
```

### Lane Switching in the CLI (`agy`)
- Switch active lane in session: `/model bb/agentic-coding`
- Adjust reasoning depth: `/effort medium`
- View active provider: `/model`

---

## 5. Summary Checklist

- [x] Cloned plugin to workspace (`.agents/plugins/cruise`) or global (`~/.gemini/config/plugins/cruise`).
- [x] Exported `CRUISE_API_KEY="cru_live_..."` in shell environment.
- [x] Verified MCP tool execution using example prompts for `list_models`, `get_spend`, and `get_budget`.
- [x] Tested zero-cost demo environment with `cru_demo_...`.
