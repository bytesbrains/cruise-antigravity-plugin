---
name: cruise
description: >-
  Use this skill when selecting or optimizing Cruise AI model routing lanes (bb/agentic-coding, bb/chat-assistant, bb/extraction, bb/fast),
  when inspecting model capabilities (x-cruise.any_member), or when diagnosing and resolving Cruise gateway refusals
  (including HTTP 429 rate limits, HTTP 402 period budget caps, and lifetime wallet exhaustion).
---

# Cruise Lane Selection & Refusal Runbooks

This skill guides the agent in selecting appropriate model routing lanes, verifying capabilities via `x-cruise.any_member`, and diagnosing or resolving refusal errors returned by the BytesBrains Cruise Gateway.

## 1. Lane Selection Guide

Cruise routes model requests through virtual lane aliases. Selecting the right lane balances reasoning capacity, context window size, latency, and cost:

| Lane Alias | Target Workload | Characteristics | Typical Fallback |
| :--- | :--- | :--- | :--- |
| `bb/agentic-coding` | Autonomous code generation, multi-step debugging, complex refactoring, test suite development | Highest reasoning capacity, large context window, tool-call and function-calling optimized | `bb/chat-assistant` |
| `bb/chat-assistant` | Conversational pairing, code explanations, documentation reviews, interactive queries | High conversational quality, moderate cost, balanced latency | `bb/fast` |
| `bb/extraction` | Structured data parsing, AST metadata extraction, JSON schema validation | Strict JSON schema compliance, high deterministic parsing fidelity | `bb/fast` |
| `bb/fast` | High-frequency lookups, quick summaries, lint fixes, repetitive transformations | Ultra-low latency, minimal cost, suited for high-volume tasks | None |

### Best Practices:
1. **Always default coding tasks** to `bb/agentic-coding`.
2. **Use `bb/extraction`** when generating strict structured outputs or parsing tabular/JSON data.
3. **Downgrade to `bb/fast`** for minor edits, summaries, format checks, and commit messages to conserve project budget.
4. **Prefer virtual lanes over pinned models** (`provider/model`) unless a specific vendor model or snapshot is strictly mandated.
5. **Call `list_models`** via the Cruise MCP tool (`kind: "lanes"`) to dynamically discover available tenant lanes, underlying members, and pricing.

---

## 2. Inspecting Lane Capabilities (`x-cruise.any_member`)

When querying the model catalogue via the `list_models` MCP tool or the `/v1/models` endpoint, Cruise annotates each lane with `x-cruise` metadata.

Virtual lanes aggregate multiple member models. To determine whether a lane can satisfy task requirements:
- Inspect `x-cruise.any_member`: A capability map indicating features supported by members within the lane:
  - `x-cruise.any_member.tools`: Confirms member models support function calling and MCP tools.
  - `x-cruise.any_member.streaming`: Confirms support for token streaming (`text/event-stream`).
  - `x-cruise.any_member.vision`: Confirms multimodal image and visual processing capability.
  - `x-cruise.any_member.json_schema`: Confirms support for strict structured JSON outputs.

> [!TIP]
> If a task requires tool execution or streaming, verify that `x-cruise.any_member.tools` or `x-cruise.any_member.streaming` is `true`. If absent, route to a lane or pinned model that explicitly supports the capability.

---

## 3. Refusal Diagnostics & Runbooks

When a request to Cruise fails, inspect `error.code` in the JSON response rather than relying solely on the HTTP status code:

### A. Period Budget Cap Exceeded (`budget_exhausted` / HTTP 429)
- **Symptom**: HTTP 429 returned with `error.code: "budget_exhausted"`.
- **Meaning**: The project's allocated spend cap for the active billing period (e.g., daily, weekly, or monthly) has been reached.
- **Characteristics**: **Temporary / period-bound.** Carries a `Retry-After` header or period reset timestamp.
- **Action**:
  1. Inspect the `Retry-After` header and invoke the `get_budget` MCP tool to determine the current spend and reset schedule.
  2. **Do not retry continuously in a loop.**
  3. Inform the user:
     > "Cruise request refused (period budget exhausted): The project budget cap has been reached for this billing period. The cap will automatically reset at the period boundary, or the cap may be increased in the Cruise dashboard."

### B. Lifetime Wallet Depleted (`wallet_exhausted` / HTTP 402 or 429)
- **Symptom**: HTTP 402 or 429 returned with `error.code: "wallet_exhausted"`.
- **Meaning**: The organization or tenant prepaid wallet balance is zero.
- **Characteristics**: **Non-transient.** Contains **no** `Retry-After` header because elapsed time will not restore funds.
- **Action**:
  1. **Halt execution immediately.** Never retry in a loop.
  2. Invoke `get_budget` to verify wallet balance (`wallet: { balance_usd: "0.0000" }`).
  3. Inform the user:
     > "Cruise request refused (wallet exhausted): The account prepaid wallet has zero balance remaining. A credit grant or wallet top-up is required before further requests can be served."

### C. Rate Limits & Concurrency (`rate_limit_exceeded`, `account_rate_limit_exceeded` / HTTP 429)
- **Symptom**: HTTP 429 returned with `error.code: "rate_limit_exceeded"` or `"account_rate_limit_exceeded"`.
- **Meaning**: Transient request-per-minute (RPM) or token-per-minute (TPM) burst quota reached.
- **Action**:
  1. Inspect the `Retry-After` header or `retry_after` in the payload.
  2. If present, sleep for the requested duration. If absent, apply exponential backoff (2s, 4s, 8s) up to 3 retries.
  3. If rate limiting persists across retries, notify the user.

### D. Request Bounds & Context Limits (`limit_exceeded`, `request_unbounded` / HTTP 400)
- **Symptom**: HTTP 400 returned with `limit_exceeded` or `request_unbounded`.
- **Action**:
  1. Reduce conversation history and loaded file context.
  2. Resend the request with a compacted prompt payload.

### E. Stale Measurement & Routing Refusals (`measurement_stale`, `model_not_found` / HTTP 404 or 422)
- **Symptom**: Error indicating model is unreachable or latency/quality measurement has expired.
- **Action**:
  1. Call `list_models` to obtain healthy alternative lanes.
  2. Fall back to an active lane (e.g., from `bb/agentic-coding` to `bb/chat-assistant`).
