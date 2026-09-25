# BytesBrains Cruise Rules for Antigravity

When working in environments configured with the BytesBrains Cruise plugin, adhere strictly to the following operational rules and safety invariants.

## 1. Virtual Key Hygiene & Credential Invariants

- **Exclusive Virtual Keys (`cru_`)**:
  - Only Cruise-issued virtual keys (`cru_live_...`, `cru_demo_...`, `cru_test_...`) are permitted.
  - **Never accept, request, prompt for, or expose underlying vendor credentials** (e.g., OpenAI `sk-...`, Anthropic `sk-ant-...`, Google AI Studio `AIza...`, Mistral, Cohere, DeepSeek raw keys). Cruise acts as the secure gateway managing all upstream provider credentials.
- **Zero Credential Persistence**:
  - `CRUISE_API_KEY` must strictly reside in runtime environment variables (`export CRUISE_API_KEY=...`) or secure operating system secret vaults.
  - Never commit, persist, or echo API keys in workspace files, project settings, `mcp_config.json`, tests, logs, or chat transcripts.

## 2. Dynamic Catalogue Resolution & Model Selection

- **Never Hardcode Provider Model IDs**:
  - Upstream provider model identifiers and member compositions evolve over time. Do not hardcode vendor-specific model snapshots or raw upstream names.
  - Model availability, pricing per million tokens, and capability flags must be resolved dynamically at runtime using `GET /v1/models` or the `list_models` MCP tool.
- **Lane-Based Virtual Routing**:
  - Prefer Cruise virtual lanes when dispatching requests:
    - `bb/agentic-coding`: Autonomous code generation, multi-step debugging, architectural planning, and refactoring.
    - `bb/chat-assistant`: Conversational pairing, code explanations, and documentation reviews.
    - `bb/extraction`: Structured data parsing, JSON extraction, and schema validation.
    - `bb/fast`: Routine lookups, lint fixes, quick summaries, and lightweight transformations (`bb/cheap-fast` alias).
- **Capability Inspection (`x-cruise.any_member`)**:
  - Before assigning tasks requiring function calling, token streaming, or vision, inspect `x-cruise.any_member` from the catalogue to verify that members within the lane support the required capability (`tools`, `streaming`, `vision`, `json_schema`).

## 3. Network Boundary & Telemetry Policy

- **Zero Secondary Connections or Telemetry**:
  - No analytics, tracking beacons, telemetry pings, or secondary network connections are permitted.
  - All plugin network communication must be directed strictly and exclusively to the user-configured Cruise base URL (`https://cruise.bytesbrains.net` by default, or the custom `CRUISE_BASE_URL` override).
- **Host Allowlist**:
  - Communication outside the configured Cruise origin is prohibited for plugin operations.

## 4. Refusal Diagnostics & User Surfacing

When a request to Cruise fails or returns a refusal payload, inspect `error.code` rather than relying solely on the HTTP status code:

| Error Code | HTTP Status | Semantic Meaning | Required Agent Action & User Feedback |
| :--- | :--- | :--- | :--- |
| `budget_exhausted` | 429 | Project Period Budget Cap Hit | **Temporary refusal.** Carries `Retry-After` header and `x-cruise-budget-reserved`. Query `get_budget`. Do not retry in a loop. Inform the user of the period reset schedule or suggest increasing the project budget cap in the Cruise dashboard. |
| `wallet_exhausted` | 429 (or HTTP 402) | Account Prepaid Wallet Depleted | **Non-transient refusal.** Insufficient quota with **no** `Retry-After`. Halt retries immediately. Inform user that organization wallet funds are depleted and require a top-up or credit grant. |
| `rate_limit_exceeded` / `account_rate_limit_exceeded` | 429 | Request / Token Burst Rate Limit | **Transient concurrency spike.** Apply exponential backoff (e.g., 2s, 4s, 8s up to 3 attempts) respecting the `Retry-After` header. If exhaustion persists, notify user. |
| `limit_exceeded` / `request_unbounded` / `unsupported_capability` | 400 | Request Parameter or Capability Error | Request exceeds max tokens, context length, or requests unsupported capability (`tools`, `streaming`, `vision`). Reduce prompt payload or select capable lane. |
| `measurement_stale` / `model_unmeasured` | 400 | Conformance Probe Expired (>30 days) | Model or member has not been observed to serve recently. Query `list_models` via MCP to find active, healthy lanes, and fall back accordingly. |
| `model_not_found` | 404 | Model / Lane Missing from Catalogue | Model ID or lane alias does not exist. Inspect `list_models` for valid IDs. |
| `invalid_api_key` | 401 | Missing, Invalid, or Mismatched Key | Check `CRUISE_API_KEY` prefix against `CRUISE_BASE_URL` (demo vs live). |
| `permission_error` | 403 | Key Scope Restriction | Verify key permissions; request a virtual key scoped for the required lane. |

## 5. Rehearsal Demo Convention

- **Rehearse Before Production**:
  - Always encourage testing and rehearsal against the free Cruise demo environment (`https://cruise-demo.bytesbrains.net`) using `cru_demo_` keys prior to live production execution or pipeline deployments.
  - Validates end-to-end tool calling, MCP connectivity, and agent configurations without incurring charges or consuming live production budget caps.

## 6. MCP Tools & Observability

- Use Cruise MCP tools proactively:
  - `list_models`: Retrieve available lanes and inspect member capabilities (`x-cruise.any_member`) and token pricing.
  - `get_budget`: Inspect project budget caps, remaining allocation, and reset schedules before scheduling batch or long-running tasks.
  - `get_spend`: Check cumulative project spend for the current or past billing month.
