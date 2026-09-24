# Agent Guidance for cruise-antigravity-plugin

This repository contains the official **BytesBrains Cruise** plugin for **Google Antigravity** (IDE, CLI `agy`, and Antigravity 2.0).

## Project Overview

The plugin equips Antigravity with intelligent model routing, rate-limit resilience, budget caps, and MCP observability tools (`list_models`, `get_budget`, `get_spend`) backed by Cruise.

### Key Layout

- `plugins/cruise/`: Plugin bundle discovered by Antigravity workspaces (`.agents/plugins/cruise`) and global config (`~/.gemini/config/plugins/cruise`).
  - `plugin.json`: Plugin manifest (name, description, version, author). Version matches `package.json`.
  - `mcp_config.json`: Remote SSE MCP configuration pointing to Cruise gateway (`https://cruise.bytesbrains.net/mcp/sse`).
  - `rules/AGENTS.md`: Operational usage rules, credential invariants, lane routing, and refusal handling.
  - `skills/cruise/SKILL.md`: Lane selection and refusal runbooks.
  - `skills/setup/SKILL.md`: BYOK endpoint setup and verification procedures.
- `assets/`: Official branding and vector logo assets (`cruise-logo.svg`, `cruise-mark.svg`, `cruise_logo.jpg`, etc.).
- `test/`: Vitest test suite validating plugin manifest, structure, size limits, and assets.

## Machine Entrypoints & Verification

Run these commands to verify any changes:

```sh
npm ci                # Install dependencies and initialize git hooks
npm run typecheck     # Run TypeScript compiler checks (strict mode)
npm test              # Run Vitest test suite
npm run secrets:scan  # Run Gitleaks secrets detection
```

CI runs these same checks on every push and pull request.

## Conventions & Invariants

1. **Credential Security**:
   - **Never commit a Cruise API key** (`CRUISE_API_KEY`).
   - The plugin reads credentials exclusively from the runtime environment.
   - Pre-commit and pre-push hooks enforce Gitleaks secret detection with custom Cruise token signatures.
2. **Context & File Size Budgets**:
   - Keep rule files under 24 KB (24,000 bytes).
   - Keep markdown documentation readable and concise (< 450 lines per guidance file).
3. **Tests**:
   - Any additions to skills, rules, or manifests must be verified with assertions in `test/plugin.test.ts`.
4. **Git & PR Hygiene**:
   - One concern per pull request.
   - When reworking PRs with wrokin, always apply the `skip-bot-review` label before pushing updates.
