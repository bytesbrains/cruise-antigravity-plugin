# Antigravity Cruise Plugin Troubleshooting Guide

This guide covers common operational issues, diagnostics, and recovery procedures when using the **BytesBrains Cruise** plugin with **Google Antigravity** (IDE, CLI `agy`, and Antigravity 2.0).

---

## 1. Authentication Errors (`401 Unauthorized`)

When Cruise refuses a request with `HTTP 401 Unauthorized`, the gateway could not authenticate the client key.

### Common Causes & Diagnosis

| Cause | Symptom | Verification & Fix |
| :--- | :--- | :--- |
| **Missing `CRUISE_API_KEY`** | `401 Unauthorized` with `error.code: "missing_api_key"` | Verify key exists in current subshell: `echo "${CRUISE_API_KEY:0:10}..."`. If empty, export it in your shell rc (`~/.zshrc`, `~/.bashrc`). |
| **Invalid Key Prefix or Format** | `401 Unauthorized` with `error.code: "invalid_api_key"` | Cruise keys follow `cru_(live|test|demo|svc)_[A-Za-z0-9]{40}`. Ensure key is not truncated and contains no whitespace or quotation marks. |
| **Environment Mismatch** | `401 Unauthorized` on demo endpoint | Using a production `cru_live_...` key against `https://cruise-demo.bytesbrains.net` or a `cru_demo_...` key against production. Match the key to the corresponding `CRUISE_BASE_URL`. |
| **IDE Subshell Inheritance** | Works in terminal, fails in Antigravity IDE | Desktop IDEs launched via GUI launcher may not inherit shell profiles. Set the environment variable globally (`launchctl setenv` on macOS) or configure the key in IDE model settings. |

### Step-by-Step Diagnostic Test

Run a direct `curl` test to isolate whether the issue is with credentials or the Antigravity integration:

```sh
# Test against model catalogue
curl -i "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1/models" \
  -H "Authorization: Bearer ${CRUISE_API_KEY}"
```

- **HTTP 200**: Key and endpoint are healthy. The issue is likely variable expansion inside your Antigravity launcher environment.
- **HTTP 401**: Key is invalid or expired. Re-generate key in the Cruise dashboard.

---

## 2. Refusal Diagnostics & Budget Caps (`HTTP 402` vs `429`)

When an inference call or MCP tool request fails with an error status, **inspect `error.code` in the JSON response** rather than guessing based solely on the HTTP status code.

```text
                  Refusal Response
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   HTTP 429                          HTTP 402 / 429
   budget_exhausted                  wallet_exhausted
        │                                 │
   Period Cap Reached               Prepaid Wallet Depleted
   (Temporary / Period-Bound)        (Non-Transient)
        │                                 │
   - Check Retry-After / reset       - Halt execution immediately
   - Do NOT retry in a loop          - Zero balance cannot recover with time
   - Resets at period boundary       - Top-up or credit grant required
```

### A. Period Budget Cap Exceeded (`budget_exhausted` / HTTP 429)

- **Symptom**: `HTTP 429 Too Many Requests` with response payload:
  ```json
  {
    "error": {
      "code": "budget_exhausted",
      "message": "Project period budget cap of $100.00 exceeded for current billing period."
    }
  }
  ```
- **Nature**: **Temporary / Period-bound.** Carries a `Retry-After` header or period reset timestamp.
- **Runbook**:
  1. Inspect the `Retry-After` header or invoke `get_budget` via MCP to inspect current spend and reset schedule.
  2. **Do not retry continuously in a loop.** Retrying wastes CPU cycles and clutters logs.
  3. Wait for the scheduled billing period boundary (e.g., month-end), or increase the spend cap in the Cruise dashboard.

### B. Lifetime Wallet Depleted (`wallet_exhausted` / HTTP 402 or 429)

- **Symptom**: `HTTP 402 Payment Required` or `HTTP 429 Too Many Requests` with:
  ```json
  {
    "error": {
      "code": "wallet_exhausted",
      "message": "Organization prepaid wallet balance is zero ($0.0000)."
    }
  }
  ```
- **Nature**: **Non-transient.** Contains **no** `Retry-After` header because elapsed time will never restore funds.
- **Runbook**:
  1. **Halt execution immediately.**
  2. Invoke `get_budget` to verify wallet balance (`wallet.balance_usd: "0.0000"`).
  3. Notify user: A credit grant or prepaid wallet top-up is required before further model requests can be processed.

### C. Burst Rate Limits (`rate_limit_exceeded` / HTTP 429)

- **Symptom**: `HTTP 429` with `error.code: "rate_limit_exceeded"` or `"account_rate_limit_exceeded"`.
- **Nature**: Transient request-per-minute (RPM) or token-per-minute (TPM) burst spike.
- **Runbook**:
  1. Check `Retry-After` header. If present, sleep for the specified seconds.
  2. If absent, apply exponential backoff (2s, 4s, 8s) up to 3 retries.
  3. If rate limits persist across retries, switch to an alternative lane (`bb/fast` or `bb/chat-assistant`).

---

## 3. Troubleshooting MCP Tool Connectivity

Antigravity connects to Cruise MCP tools (`list_models`, `get_spend`, `get_budget`) over HTTPS/SSE via `plugins/cruise/mcp_config.json`.

### Checklist for MCP Tool Connectivity

1. **Verify `mcp_config.json` Configuration**:
   Ensure `plugins/cruise/mcp_config.json` points to the valid endpoint and uses dynamic substitution:
   ```json
   {
     "mcpServers": {
       "cruise": {
         "serverUrl": "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/mcp",
         "headers": {
           "Authorization": "Bearer ${CRUISE_API_KEY}"
         }
       }
     }
   }
   ```
2. **Test MCP Server Reachability with `curl`**:
   Verify network reachability and SSL handshake:
   ```sh
   curl -I "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/mcp" \
     -H "Authorization: Bearer ${CRUISE_API_KEY}"
   ```
   A valid response confirms outgoing HTTPS traffic is unblocked.
3. **Firewall & Proxy Issues**:
   - If behind a corporate proxy, ensure `HTTPS_PROXY` is configured in your shell environment.
   - Ensure outgoing connections to `cruise.bytesbrains.net` (port 443) are allowlisted.
4. **Reloading Plugin Customizations**:
   - In CLI (`agy`): Restart session or use `/refresh`.
   - In Antigravity IDE: Open the Command Palette (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) and run `Antigravity: Reload Window` or `Antigravity: Reload Plugins`.

---

## 4. Model Context & Gateway Bounds (`HTTP 400`)

- **Symptom**: `HTTP 400 Bad Request` with `limit_exceeded` or `request_unbounded`.
- **Cause**: Prompt history or attached file context exceeds the maximum token context window of member models in the lane.
- **Resolution**:
  1. Compact active context using `/compact` in `agy` or reducing open file tabs in the IDE.
  2. Resend prompt with focused target files.
