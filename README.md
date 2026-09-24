# BytesBrains Cruise for Google Antigravity

[![ci](https://github.com/bytesbrains/cruise-antigravity-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/bytesbrains/cruise-antigravity-plugin/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

The official [BytesBrains Cruise](https://bytesbrains.com/cruise) plugin for **Google Antigravity** (Antigravity IDE, Antigravity CLI `agy`, and Antigravity 2.0).

Brings intelligent AI model routing, budget caps, rate limiting, and observability to Antigravity through:
- **Cruise MCP Tools**: Real-time access to model catalogue, spend tracking, and budget status (`list_models`, `get_budget`, `get_spend`).
- **Cruise Skills**: Agent runbooks and skills for optimal lane selection (`bb/agentic-coding`, `bb/chat-assistant`, etc.) and graceful refusal handling.
- **Cruise Rules**: Best-practice coding and agent behavior conventions.
- **BYOK Endpoint Configuration**: Instructions and automated setup to point Antigravity inference to Cruise's unified OpenAI-compatible endpoint.

## Surfaces Supported

- **Antigravity IDE**: Workspace plugin discovery via `.agents/plugins/cruise` or user configuration (`~/.gemini/config/`).
- **Antigravity CLI (`agy`)**: Customization loading across CLI agent sessions.
- **Antigravity 2.0**: Native tool, skill, and rule integration.

## Installation

### Project Workspace

Clone or submodule into your workspace customization root:

```sh
mkdir -p .agents/plugins
git clone https://github.com/bytesbrains/cruise-antigravity-plugin.git .agents/plugins/cruise
```

### Global (All Projects)

Link or copy to your global configuration directory:

```sh
mkdir -p ~/.gemini/config/plugins
git clone https://github.com/bytesbrains/cruise-antigravity-plugin.git ~/.gemini/config/plugins/cruise
```

## Configuration

Set your Cruise API key in your environment:

```sh
export CRUISE_API_KEY="cru_live_..."
# Or test using the rehearsal demo key:
# export CRUISE_BASE_URL="https://cruise-demo.bytesbrains.net"
# export CRUISE_API_KEY="cru_demo_..."
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE) © 2026 BytesBrains Pte. Ltd.
