---
name: cruise
description: >-
  Select optimal Cruise AI model routing lanes (bb/agentic-coding, bb/chat-assistant, bb/cheap-fast)
  and diagnose or resolve Cruise Gateway refusals and budget exhaustion errors.
---

# Cruise Lane Selection & Refusal Runbooks

This skill guides the agent in selecting appropriate model routing lanes and resolving error refusals returned by the BytesBrains Cruise Gateway.

## 1. Lane Selection Guide

Cruise routes model requests via virtual lane aliases. Selecting the right lane balances capability, latency, and cost:

| Lane Alias | Target Workload | Characteristics | Typical Fallback |
| :--- | :--- | :--- | :--- |
| `bb/agentic-coding` | Code generation, complex refactors, multi-step debugging, architectural planning | Highest reasoning capacity, large context window, tool-call optimized | `bb/chat-assistant` |
| `bb/chat-assistant` | Explanations, conversational queries, documentation drafting, PR review summaries | High conversational quality, moderate cost, balanced latency | `bb/cheap-fast` |
| `bb/cheap-fast` | Lint fixes, format checks, commit messages, minor utility tasks | Ultra-low latency, minimal cost, suited for high-volume quick tasks | None |

### Best Practices:
1. Always route automated coding tasks to `bb/agentic-coding`.
2. Downgrade to `bb/cheap-fast` for small scripts or repetitive transformations to conserve budget.
3. Call `list_models` via the Cruise MCP tool to inspect custom tenant lanes or current lane availability.

---

## 2. Refusal Runbooks

When a request to Cruise fails, inspect `error.code` in the JSON response:

### A. Rate Limits & Concurrency (`rate_limit_exceeded`, `account_rate_limit_exceeded`)
- **Symptom**: HTTP 429 returned with `rate_limit_exceeded` or `account_rate_limit_exceeded`.
- **Action**:
  1. Inspect the `Retry-After` HTTP header or `retry_after` in the error response payload.
  2. If present, sleep for the requested duration before retrying.
  3. If absent, apply exponential backoff (e.g., 2s, 4s, 8s) up to a maximum of 3 retries.
  4. If rate limiting persists, notify the user.

### B. Budget & Wallet Exhaustion (`budget_exhausted`, `wallet_exhausted`)
- **Symptom**: HTTP 429 / 402 returned with `budget_exhausted` or `wallet_exhausted`.
- **Action**:
  1. **Do not retry.** No `Retry-After` header is returned because budget exhaustion is non-transient.
  2. Call the `get_budget` MCP tool to retrieve current spend vs. limit.
  3. Inform the user:
     > "Cruise request refused: Your project budget or organization wallet has been exhausted. Please replenish funds or adjust your budget cap in the Cruise dashboard before retrying."

### C. Context & Request Limits (`limit_exceeded`, `request_unbounded`)
- **Symptom**: HTTP 400 returned with `limit_exceeded` or `request_unbounded`.
- **Action**:
  1. Check prompt token length and output token specifications.
  2. Reduce loaded file contexts, omit large generated files, or truncate history.
  3. Retry the request with the compacted payload.

### D. Model or Capability Errors (`model_not_found`, `unsupported_capability`)
- **Symptom**: HTTP 404 / 400 returned when invoking an unsupported lane or feature.
- **Action**:
  1. Call `list_models` via MCP to verify available models and aliases.
  2. Update the model parameter to an existing active lane.
