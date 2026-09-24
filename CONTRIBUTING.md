# Contributing

Thanks for caring about the plugin. This repo is the source of truth for the `cruise` plugin
for Google Antigravity (Antigravity IDE, Antigravity CLI `agy`, and Antigravity 2.0).

## Ground rules

- **Never commit a Cruise key.** The plugin reads `CRUISE_API_KEY` from the environment or secret
  store at run time and never writes it anywhere: not to a settings file, not to the MCP config.
- **No telemetry, no second host.** The plugin reaches only the Cruise base URL the user
  configures.
- **Setup asks before it changes a file.**
- **Every change is a pull request into `main`**, one concern each.

## Setup

```sh
git clone https://github.com/bytesbrains/cruise-antigravity-plugin.git
cd cruise-antigravity-plugin
npm ci
```

`npm ci` runs `prepare`, which points `core.hooksPath` at `.githooks/`. **pre-commit** runs
`gitleaks protect` on the staged diff, and **pre-push** runs `gitleaks detect` over the full
history. Both use `.gitleaks.toml`, which includes the Cruise key shapes. The hooks need
[gitleaks](https://github.com/gitleaks/gitleaks) (`brew install gitleaks`) and fail if it is
missing.

## Checks

```sh
npm run typecheck
npm test
npm run secrets:scan
```

CI runs the same checks on every pull request and on every push to `main`.

## Releasing (maintainers)

A release is a **tag** that a person cuts. Bump `plugins/cruise/plugin.json`'s `version` on every release.

```sh
git fetch origin
git tag v0.x.y origin/main
git push origin v0.x.y
```
