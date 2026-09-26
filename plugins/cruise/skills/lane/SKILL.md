---
name: cruise-lane
description: >-
  Use this skill when discovering, inspecting, or switching Cruise model routing lanes (bb/agentic-coding,
  bb/chat-assistant, bb/extraction, bb/fast), or when the user invokes /cruise-lane or /cruise-models.
  Dynamically queries lane capabilities, member models, and context bounds via the list_models MCP tool,
  and guides switching active session models in the agy CLI (/model) or adjusting reasoning effort (/effort).
---

# Cruise Dynamic Model Lanes & Selection Runbook

Use this runbook when discovering model capabilities, evaluating available routing lanes, or switching active session models in Antigravity IDE and the `agy` CLI, or whenever `/cruise-lane` or `/cruise-models` is invoked.

## 1. Dynamic Lane Discovery via MCP (`list_models`)

Cruise routes model requests through dynamic virtual lanes rather than pinned vendor snapshots. When the user requests lane inspection or triggers `/cruise-lane` / `/cruise-models`, discover live capabilities dynamically.

### Step 1: Call `list_models` MCP Tool

Invoke the Cruise MCP tool `list_models` with the `lanes` kind parameter:

```json
{
  "name": "list_models",
  "arguments": {
    "kind": "lanes"
  }
}
```

*Fallback Probe*: If running outside an active MCP session, execute the authenticated OpenAI-compatible probe:
```sh
curl -s -f "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1/models" \
  -H "Authorization: Bearer ${CRUISE_API_KEY}"
```

Or execute the bundled lane inspection helper:
```sh
# Formatted Markdown summary
./plugins/cruise/skills/lane/scripts/lane.sh --markdown

# Or via npm script
npm run lanes
```

---

## 2. Inspecting Lane Attributes & Capability Matrix

When Cruise returns the lane catalogue, inspect the `x-cruise` metadata block for each virtual lane. Format and present the following structured comparison tables to the user:

### A. Capability Matrix & Context Bounds

Inspect `x-cruise.any_member` flags (`tools`, `streaming`, `vision`, `json_schema`), pricing, and context limits:

| Lane Alias | Tools | Streaming | Vision | JSON Schema | Context (In / Out) | Pricing (Prompt / Comp) | Cost Tier |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `bb/agentic-coding` | ✓ | ✓ | ✓ | ✓ | 200k / 8k | $3.00 / $15.00 | Standard / Premium |
| `bb/chat-assistant` | ✓ | ✓ | ✓ | ✓ | 128k / 4k | $0.80 / $3.20 | Balanced |
| `bb/extraction` | ✓ | ✓ | ✗ | ✓ | 128k / 4k | $0.50 / $1.50 | High-Fidelity |
| `bb/fast` | ✓ | ✓ | ✗ | ✓ | 64k / 2k | $0.15 / $0.60 | Ultra-Low Cost |

> [!TIP]
> **Capability Verification**: Before running tasks that require function calling or multimodal image inputs, always confirm `x-cruise.any_member.tools: true` or `x-cruise.any_member.vision: true`. Notice that `bb/extraction` and `bb/fast` do not support vision inputs.

### B. Underlying Member Model Breakdown

Virtual lanes aggregate healthy upstream models behind unified endpoints. Cruise dynamically routes across these members based on live latency, throughput, and error rates:

| Lane Alias | Underlying Member Models | Primary Routing Purpose |
| :--- | :--- | :--- |
| `bb/agentic-coding` | `anthropic/claude-3-7-sonnet`, `openai/gpt-4o` | Autonomous coding, multi-step agent loops, test suite authoring |
| `bb/chat-assistant` | `anthropic/claude-3-5-haiku`, `openai/gpt-4o-mini` | Interactive pair programming, explanations, PR reviews |
| `bb/extraction` | `mistral/codestral`, `meta-llama/llama-3.3-70b-instruct` | Strict structured output, AST parsing, schema conformance |
| `bb/fast` | `cloudflare/@cf/meta/llama-3.1-8b-instruct`, `google/gemini-2.0-flash-lite` | Ultra-low latency, lint fixes, commit message drafting |

---

## 3. Workload Recommendations & Effort Tuning

Match the user's current development activity to the optimal lane and reasoning effort setting:

| Target Workload | Recommended Lane | Suggested Effort | Rationale & Ideal Scenarios |
| :--- | :--- | :--- | :--- |
| **Autonomous Coding** | `bb/agentic-coding` | `/effort high` | Full multi-file edits, complex refactoring, test suite development, architecture design. |
| **Chat & Pairing** | `bb/chat-assistant` | `/effort medium` | Collaborative coding questions, API usage discussions, code reviews, debugging guidance. |
| **Extraction & Parsing** | `bb/extraction` | `/effort low` | Structured JSON generation, OpenAPI specification parsing, tabular data transformation. |
| **Linting & Quick Edits** | `bb/fast` | `/effort none` | High-frequency style fixes, commit message generation, documentation summaries, quick lookups. |

---

## 4. Interactive Model Switching in Antigravity

Guide the user with clear commands to switch their active session model or persist defaults across sessions:

### In-Session Model Switching (`/model`)

To immediately change the active lane in the running `agy` CLI session, type:

```sh
/model bb/agentic-coding
# Or switch to chat / fast lanes:
/model bb/chat-assistant
/model bb/extraction
/model bb/fast
```

### Tuning Reasoning Effort (`/effort`)

For models that support variable reasoning effort (e.g. Claude 3.7 Sonnet thinking tokens, OpenAI o-series/reasoning tokens), adjust reasoning depth:

```sh
/effort high    # Maximum reasoning depth for complex multi-step architecture
/effort medium  # Default balanced reasoning for pair programming
/effort low     # Concise reasoning for quick answers
/effort none    # Zero reasoning overhead for fastest response latency
```

### Persistent Configuration (`settings.json`)

To set the default model permanently across all workspace launches, update `~/.gemini/antigravity-cli/settings.json`:

```json
{
  "modelProvider": "openai",
  "openaiBaseUrl": "https://cruise.bytesbrains.net/v1",
  "openaiApiKey": "${CRUISE_API_KEY}",
  "model": "bb/agentic-coding"
}
```

Or run the automated lane switcher:
```sh
# Programmatically set active model in settings.json:
node plugins/cruise/skills/lane/scripts/lane.ts --select=bb/agentic-coding
```

---

## 5. Stale Measurement & Refusal Diagnostics

If a lane returns `measurement_stale` or `model_not_found`:
1. Re-query `list_models` (`kind: "lanes"`) to obtain active healthy alternatives.
2. Route traffic to an adjacent fallback lane:
   - If `bb/agentic-coding` is unavailable, fall back to `bb/chat-assistant`.
   - If `bb/extraction` is unavailable, fall back to `bb/fast`.
3. Check `get_budget` to verify that the project spend cap or prepaid wallet balance has not been exhausted.
