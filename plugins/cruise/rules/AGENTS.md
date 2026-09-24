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
  - `bb/agentic-coding`: Complex coding, refactoring, architectural planning, and deep debugging.
  - `bb/chat-assistant`: Conversational pairing, code explanations, and documentation reviews.
  - `bb/cheap-fast`: Routine formatting, lint checks, repetitive transformations, and lightweight lookups.
- Avoid pinning hardcoded vendor model names when dynamic lane aliases are configured.

## 3. Graceful Refusal & Rate Limit Handling

When receiving a non-200 response or refusal from Cruise's OpenAI-compatible endpoint:
- Inspect `error.code`:
  - `rate_limit_exceeded` / `account_rate_limit_exceeded`: Check for the `retry-after` header and back off accordingly.
  - `budget_exhausted` / `wallet_exhausted`: Refusal is terminal for the billing period. Do not retry in a loop; halt immediately and inform the user that their Cruise budget or wallet balance is depleted.
  - `limit_exceeded` / `request_unbounded`: Reduce context window size, truncate excessive file inclusions, and retry.
  - `model_not_found`: Verify available models using the `list_models` MCP tool before proceeding.
  - `unsupported_capability`: Fall back to an appropriate lane supporting the required capability (e.g., function calling, vision).

## 4. MCP Tools & Observability

- Use Cruise MCP tools proactively:
  - `list_models`: Retrieve available lanes and underlying models accessible to the current key.
  - `get_budget`: Inspect project budget caps, remaining allocation, and reset schedules before scheduling batch or long-running tasks.
  - `get_spend`: Check cumulative project spend.
