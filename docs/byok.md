# BYOK & Model Provider Routing Guide

This guide details how to configure **Antigravity IDE** and the **Antigravity CLI (`agy`)** to route model inference requests and chat completions through the **BytesBrains Cruise** OpenAI-compatible gateway.

---

## Overview & Architecture

Cruise exposes a unified OpenAI-compatible data plane in front of multiple LLM providers:

```text
Antigravity (IDE / agy CLI)
         │
         ▼  (OpenAI-Compatible Chat API)
https://cruise.bytesbrains.net/v1/chat/completions
Authorization: Bearer cru_...
         │
         ▼  (Virtual Routing & Fallovers)
[BytesBrains Cruise Gateway]
 ├── bb/agentic-coding ──► Claude 3.7 / GPT-4.5 / DeepSeek V3
 ├── bb/chat-assistant ──► Claude 3.5 Sonnet / GPT-4o
 ├── bb/extraction     ──► Strict JSON Schema Models
 └── bb/fast           ──► Lightweight / Low-latency Models
```

Every request sent through Cruise is governed by project budgets, prepaid organization wallets, and real-time ledger accounting.

---

## 1. Antigravity CLI (`agy`) BYOK Configuration

The Antigravity CLI (`agy`) can route its inference sessions through Cruise by configuring the runtime environment or user-level settings.

> [!TIP]
> **Automated Setup Wizard**: Use `/cruise-setup` inside Antigravity or run `npm run setup` in your terminal to automatically validate credentials and configure `~/.gemini/antigravity-cli/settings.json`.

### Option A: Environment Variable Configuration (Recommended)

Set the OpenAI-compatible environment variables before launching `agy`:

```sh
# Set your virtual Cruise API key
export CRUISE_API_KEY="cru_live_..."

# Configure OpenAI compatibility to point to Cruise's /v1 endpoint
export OPENAI_BASE_URL="${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1"
export OPENAI_API_KEY="$CRUISE_API_KEY"

# Launch agy with your chosen Cruise lane
agy --model "bb/agentic-coding"
```

### Option B: Persistent CLI Settings (`~/.gemini/antigravity-cli/settings.json`)

To make Cruise the default model provider across all `agy` sessions, add the provider configuration to your CLI settings file:

```json
{
  "modelProvider": "openai",
  "openaiBaseUrl": "https://cruise.bytesbrains.net/v1",
  "openaiApiKey": "${CRUISE_API_KEY}",
  "model": "bb/agentic-coding"
}
```

> [!IMPORTANT]
> Always reference `${CRUISE_API_KEY}` dynamically or export it in your shell profile (`~/.zshrc` / `~/.bashrc`). Never hardcode literal API keys into `settings.json`.

### Interactive In-Session Model Switching

Inside an active `agy` session:
- Type `/model` to view available models and switch between lanes (e.g., `bb/agentic-coding`, `bb/chat-assistant`).
- Type `/effort` to adjust reasoning effort if using supported reasoning models in the lane.

---

## 2. Antigravity IDE Integration

Antigravity IDE (and the Antigravity 2.0 desktop application) supports custom OpenAI-compatible providers for agent and sidebar chat.

### Step-by-Step Configuration

1. **Open Settings**:
   - Press <kbd>Cmd</kbd>+<kbd>,</kbd> (macOS) or <kbd>Ctrl</kbd>+<kbd>,</kbd> (Linux/Windows).
2. **Navigate to Model Provider Settings**:
   - In the settings search bar, type `Model Provider` or `Custom Models`.
   - Select **AI Models > Custom Provider (OpenAI Compatible)**.
3. **Configure the Cruise Provider Endpoint**:
   - **Provider Name**: `BytesBrains Cruise`
   - **Base URL**: `https://cruise.bytesbrains.net/v1`
   - **API Key**: Enter your `cru_live_...` key (or `cru_demo_...` for the demo environment).
4. **Register Cruise Virtual Lanes**:
   Add the following model IDs into the custom models list:
   - `bb/agentic-coding` (Recommended default for coding & agent tasks)
   - `bb/chat-assistant`
   - `bb/extraction`
   - `bb/fast`
5. **Select Active Model**:
   - Open the Antigravity Chat panel (<kbd>Cmd</kbd>+<kbd>L</kbd> / <kbd>Ctrl</kbd>+<kbd>L</kbd>).
   - In the model dropdown selector, choose `bb/agentic-coding`.

---

## 3. Demo Rehearsal Guide (Zero Cost)

Before committing live production quotas, verify your setup against the free Cruise rehearsal demo environment:

```text
Demo Base URL: https://cruise-demo.bytesbrains.net
Demo Auth:     Bearer cru_demo_...
```

### Reproducible Verification with `curl`

Verify endpoint authentication and chat completion formatting:

```sh
# 1. Set demo environment variables
export CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net"
export CRUISE_API_KEY="cru_demo_..."

# 2. Verify model catalogue resolution
curl -s "${CRUISE_BASE_URL}/v1/models" \
  -H "Authorization: Bearer ${CRUISE_API_KEY}"

# 3. Test chat completions
curl -s "${CRUISE_BASE_URL}/v1/chat/completions" \
  -H "Authorization: Bearer ${CRUISE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bb/agentic-coding",
    "messages": [
      {"role": "user", "content": "Ping: Verify Antigravity Cruise BYOK connectivity."}
    ]
  }'
```

### Reproducible Rehearsal with `agy`

Launch a rehearsal CLI session against the demo endpoint:

```sh
CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net" \
OPENAI_BASE_URL="https://cruise-demo.bytesbrains.net/v1" \
OPENAI_API_KEY="cru_demo_..." \
agy --model "bb/agentic-coding"
```

Verify that prompt tokens and responses appear without error.

---

## 4. Lane Selection Mapping for Agent Roles

When configuring subagents, prompt workflows, or IDE modes, map workloads to the optimal Cruise virtual lane:

| Antigravity Agent Role | Recommended Lane | Fallback Lane | Workload Suitability & Rationale |
| :--- | :--- | :--- | :--- |
| **Lead / Autonomous Coding Agent** | `bb/agentic-coding` | `bb/chat-assistant` | Multi-file code generation, complex refactors, terminal command execution, and test debugging. Maximizes reasoning depth and tool-calling fidelity. |
| **Interactive Pair Programming** | `bb/chat-assistant` | `bb/fast` | Conversational pairing, explaining design patterns, code review summaries, and answering inline queries. |
| **Research Subagent** (`research`) | `bb/chat-assistant` | `bb/fast` | Codebase exploration, file search, documentation lookups, and summarizing external libraries. |
| **Structured Extraction & Parsing** | `bb/extraction` | `bb/fast` | AST metadata extraction, log parsing, JSON schema enforcement, and tool call payload transformations. |
| **Fast / Lightweight Subagent** (`flash_lite` / `flash`) | `bb/fast` | None | High-frequency formatting, lint fixes, commit message drafting, and minor utility tasks with minimal token cost. |

> [!TIP]
> **Dynamic Lane Inspection**: Type `/cruise-lane` or `/cruise-models` in Antigravity to dynamically inspect current member model health, capability matrices (`x-cruise.any_member`), context bounds, and pricing tiers across all available lanes. Switch models interactively using `/model <lane>` or adjust reasoning effort via `/effort <high|medium|low|none>`.

---

## 5. Security & Invariant Checklist

- [x] **Zero Hardcoded Keys**: Store `CRUISE_API_KEY` strictly in the environment or secret vaults.
- [x] **No Provider Keys**: Never pass raw OpenAI, Anthropic, or Google keys to Cruise; only Cruise virtual keys (`cru_`) are accepted.
- [x] **Strict Egress**: All model traffic must terminate strictly at the configured `CRUISE_BASE_URL`.
- [x] **Budget Monitoring**: Use the `get_budget` MCP tool before scheduling large batch agent operations.
