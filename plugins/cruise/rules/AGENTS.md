# BytesBrains Cruise Rules for Antigravity

When working in environments configured with the BytesBrains Cruise plugin, adhere to the following rules and operational guidelines.

## 1. Credential Security & Invariants

- **Never log, store, or commit Cruise credentials.**
  - `CRUISE_API_KEY` must always reside in the runtime environment or a secure secret store.
  - Never write API keys into workspace settings, `mcp_config.json`, source files, test fixtures, or repository commits.
- **No telemetry or secondary endpoints:**
  - Plugin network communication must strictly point to the user-configured Cruise base URL (`https://cruise.bytesbrains.net` by default or custom `CRUISE_BASE_URL`).

## 2. Lane & Model Routing Conventions

- Route inference requests through appropriate Cruise virtual lanes based on workload characteristics:
  - `bb/agentic-coding`: Complex coding, multi-step debugging, architectural planning, and refactoring.
  - `bb/chat-assistant`: Conversational pairing, code explanations, and documentation reviews.
  - `bb/extraction`: Structured data parsing, JSON extraction, and schema validation.
  - `bb/fast`: Routine lookups, lint fixes, quick summaries, and lightweight transformations (`bb/cheap-fast` alias).
- Avoid pinning hardcoded vendor model names when dynamic lane aliases are configured.
- When evaluating lanes for tool execution or streaming, inspect `x-cruise.any_member` to ensure the lane satisfies capability requirements.

## 3. Graceful Refusal & Rate Limit Handling

When receiving a non-200 response or refusal from Cruise's OpenAI-compatible endpoint:
- Inspect `error.code` rather than relying solely on the HTTP status:
  - `rate_limit_exceeded` / `account_rate_limit_exceeded` (HTTP 429): Check for the `retry-after` header and back off exponentially.
  - `budget_exhausted` (HTTP 429): Project period budget exhausted. Temporary until period boundary reset; check `retry-after` and inspect `get_budget`. Do not retry in a loop.
  - `wallet_exhausted` (HTTP 402 or 429): Organization prepaid wallet depleted. Non-transient; no `retry-after` header. Halt immediately and notify the user to replenish wallet funds.
  - `limit_exceeded` / `request_unbounded` (HTTP 400): Reduce context window size, truncate excessive file inclusions, and retry.
  - `model_not_found` / `measurement_stale`: Verify available models and healthy lanes using the `list_models` MCP tool before proceeding.
  - `unsupported_capability`: Fall back to an appropriate lane supporting the required capability (e.g., function calling, vision).

## 4. MCP Tools & Observability

- Use Cruise MCP tools proactively:
  - `list_models`: Retrieve available lanes and inspect member capabilities (`x-cruise.any_member`) and token pricing.
  - `get_budget`: Inspect project budget caps, remaining allocation, and reset schedules before scheduling batch or long-running tasks.
  - `get_spend`: Check cumulative project spend for the current or past billing month.
