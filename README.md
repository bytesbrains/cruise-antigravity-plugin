<p align="center">
  <a href="https://bytesbrains.com/cruise">
    <img src="assets/cruise-logo.svg" alt="BytesBrains Cruise" width="380">
  </a>
</p>

# BytesBrains Cruise for Google Antigravity

[![ci](https://github.com/bytesbrains/cruise-antigravity-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/bytesbrains/cruise-antigravity-plugin/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

The official [BytesBrains Cruise](https://bytesbrains.com/cruise) plugin for **Google Antigravity** (Antigravity IDE, Antigravity CLI `agy`, and Antigravity 2.0).

Brings intelligent AI model routing, budget caps, rate limiting, and observability to Antigravity through:
- **Cruise MCP Tools**: Real-time access to model catalogue, spend tracking, and budget status (`list_models`, `get_budget`, `get_spend`).
- **Cruise Skills**: Agent runbooks and skills for optimal lane selection (`bb/agentic-coding`, `bb/chat-assistant`, `bb/cheap-fast`) and graceful refusal handling.
- **Cruise Rules**: Operational guidelines, credential security (`CRUISE_API_KEY`), and agent behavior conventions (`AGENTS.md`).
- **BYOK Endpoint Configuration**: Guidance and automated runbooks to route Antigravity inference to Cruise's unified OpenAI-compatible endpoint.

## Surfaces Supported

- **Antigravity IDE**: Workspace plugin discovery via `.agents/plugins/cruise` or user configuration (`~/.gemini/config/`).
- **Antigravity CLI (`agy`)**: Customization loading across CLI agent sessions.
- **Antigravity 2.0**: Native tool, skill, and rule integration.

## Plugin Structure

```text
plugins/cruise/
├── plugin.json       # Plugin manifest declaring metadata & version
├── mcp_config.json   # Remote MCP configuration for Cruise tools
├── rules/
│   └── AGENTS.md     # Cruise usage rules, safety invariants, and refusal policies
└── skills/
    ├── cruise/
    │   └── SKILL.md  # Lane selection runbook & refusal recovery workflows
    └── setup/
        └── SKILL.md  # Setup, BYOK configuration, and verification runbook
```

## Installation & Discovery

Antigravity automatically discovers customizations by traversing specific directories.

### 1. Workspace Discovery (Project-Specific)

Clone or submodule into your project's customization root:

```sh
mkdir -p .agents/plugins
git clone https://github.com/bytesbrains/cruise-antigravity-plugin.git .agents/plugins/cruise
```

### 2. Global Discovery (All Projects)

Clone into your user-level configuration directory:

```sh
mkdir -p ~/.gemini/config/plugins
git clone https://github.com/bytesbrains/cruise-antigravity-plugin.git ~/.gemini/config/plugins/cruise
```

### 3. Explicit Inclusion (`plugins.json`)

For workspaces that store customizations in custom locations or require explicit registration, add an entry to your workspace's `.agents/plugins.json`:

```json
{
  "entries": [
    {
      "path": "path/to/cruise-antigravity-plugin/plugins"
    }
  ]
}
```

## Lifecycle & State

The plugin is enabled by default upon discovery. It can be toggled using either method:

- **Manifest default**: Set `"disabled": true` in `plugins/cruise/plugin.json` to ship or keep the plugin disabled by default.
- **User configuration**: Toggle the plugin in `~/.gemini/config.json` (or via `agy plugin enable/disable cruise`):

```json
{
  "plugins": {
    "cruise": {
      "enabled": false
    }
  }
}
```

## Configuration

Set your Cruise API key in your environment:

```sh
export CRUISE_API_KEY="cru_live_..."

# Or test using the rehearsal demo key:
# export CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net"
# export CRUISE_API_KEY="cru_demo_..."
```

> [!IMPORTANT]
> Keep `CRUISE_API_KEY` strictly in your shell environment or secret store. Never commit credentials to version control or settings files.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

<p align="left">
  <a href="https://bytesbrains.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/bytesbrains_dark_logo.png">
      <img src="assets/bytesbrains_light_logo.png" alt="BytesBrains" width="160">
    </picture>
  </a>
</p>

[Apache-2.0](LICENSE) © 2026 BytesBrains Pte. Ltd.
