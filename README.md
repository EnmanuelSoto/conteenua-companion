# Conteenua Companion

**Use your own ChatGPT account to work with approved repositories on your own computer from Conteenua web or mobile.**

Conteenua Companion is the open-source local execution layer for Conteenua's **Use your own AI** coding path. It keeps source code, local filesystem paths, terminal processes, browser credentials, and ChatGPT authentication on the user's computer. Conteenua's cloud receives only device/project metadata, remote-session commands, approval decisions, and safe activity summaries needed to control the session remotely.

This path is intentionally separate from **Conteenua AI**. Using Conteenua Companion does **not** reserve or charge Conteenua AI credits and never silently falls through to Conteenua's hosted AI executor.

## What it does

- lets the user explicitly approve local project folders;
- exposes bounded local filesystem and terminal tools through MCP;
- connects a normal ChatGPT conversation to those tools when the user's ChatGPT workspace supports the required connector capabilities;
- pairs the computer with the user's Conteenua account through an outbound authenticated connection;
- guides the user through a persistent OpenAI tunnel for the Core connector, with a verified Cloudflare quick-tunnel fallback for temporary testing, plus end-to-end evidence when ChatGPT reaches/uses the connector;
- mirrors only project names/IDs, device state, provider readiness, safe progress summaries, and approval state to Conteenua;
- lets Conteenua web/mobile start, follow up, pause, stop, and open local ChatGPT coding sessions;
- keeps ChatGPT authentication in the user's own browser and never asks Conteenua for an OpenAI password, cookie, or session token.

## Current status

This repository is an early Conteenua Companion beta. The local MCP/browser bridge, approved-folder sandbox, terminal/session infrastructure, secure credential storage, desktop packaging, persistent-tunnel setup, and Conteenua device/session control plane are operational and being dogfooded against the main Conteenua application before signed public installer releases are published.

The initial supported provider is **normal ChatGPT**, not Codex. The architecture keeps provider adapters replaceable:

- `chatgpt_official_mcp` — preferred when the user's ChatGPT workspace exposes the required write-capable MCP behavior;
- `chatgpt_browser` — Conteenua's local browser/extension bridge for opening and steering the normal ChatGPT conversation while preserving the same local MCP permission boundary;
- future adapters may include Claude Code, Codex, or other user-owned providers, but they are not silently substituted for ChatGPT.

Conteenua Companion does not attempt to bypass provider usage limits, account restrictions, plan capabilities, or safety controls. If the user's ChatGPT account does not expose writable MCP tools, Conteenua reports that limitation rather than routing the task through a different paid provider.

This feature therefore requires a ChatGPT account/workspace that exposes Developer mode plus writable custom plugin/MCP tools. Conteenua checks the connected account at runtime instead of assuming support from the plan name alone; unsupported accounts simply keep remote coding unavailable.

### Verified normal-ChatGPT path

Private-beta acceptance on 2026-09-24 used a signed-in ChatGPT Pro account in ordinary **Chat** mode, not Work/Codex. A Conteenua developer MCP app discovered `read`, `apply_patch`, `exec_command`, `write_stdin`, and `update_plan`; a normal Chat turn read the local Conteenua repository; Conteenua web started a remote session that wrote a disposable local file and verified it through a terminal command; and a Conteenua follow-up continued the same normal Chat conversation. Stop/cancel terminal-state behavior has focused regression coverage in the Companion control plane. That acceptance created no Conteenua AI credit-ledger usage. Provider availability can vary by account/workspace and is checked at runtime rather than assumed globally.

### Stable connector vs temporary fallback

For normal use, configure a persistent **OpenAI Secure MCP Tunnel** in the Companion and create the ChatGPT developer app using **Tunnel** mode. The restricted tunnel API key is stored through the operating system's secure credential store and is never returned to the renderer after storage. The browser/Cloudflare path remains available as a temporary fallback; its public Server URL can rotate after restart, so a ChatGPT developer app using that URL may need to be refreshed or recreated.

## Privacy boundary

Normal local mode keeps these on the computer:

- repository contents and local paths;
- shell environment and child processes;
- ChatGPT cookies/session credentials;
- browser profile data;
- operating-system credentials;
- full terminal output unless the user explicitly chooses to share it.

Conteenua cloud stores only what is needed for remote control, such as device identity/presence, project display metadata, session state, user-authored remote instructions, approval decisions, and bounded safe activity events. See [`docs/privacy.md`](docs/privacy.md).

## Security model

The companion is a local trust boundary, not a sandboxed cloud IDE. Approved-folder checks constrain model-facing file tools, while terminal commands execute as the logged-in operating-system user. Users should approve only repositories they intend the AI to access and supervise high-risk actions. See [`SECURITY.md`](SECURITY.md) and [`docs/architecture.md`](docs/architecture.md).

## Development

Requirements currently follow the upstream Electron toolchain: Node.js 22.12+ is recommended.

### Supported desktop environments

- **Windows:** current supported Windows 10/11 environments used by Electron 44.
- **macOS:** **macOS 13 Ventura or newer**. Public GA should use signed/notarized builds; the current private beta is unsigned.
- **Linux:** modern x64/arm64 desktop distributions with GTK 3 and an available system keyring/Secret Service. The AppImage first tries Electron's normal sandbox. If the host disables unprivileged user namespaces, the generated AppImage launcher adds `--no-sandbox` only as a compatibility fallback. Running without the Chromium sandbox reduces isolation, so users should prefer enabling unprivileged user namespaces where their distribution supports it.

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Public release artifacts will be produced as:

- `Conteenua-Companion-Setup-x64.exe`
- `Conteenua-Companion-Setup-arm64.exe`
- `Conteenua-Companion-macOS-x64.dmg`
- `Conteenua-Companion-macOS-arm64.dmg`
- `Conteenua-Companion-Linux-x64.AppImage`
- `Conteenua-Companion-Linux-x64.deb`
- corresponding arm64 Linux builds
- `Conteenua-Companion-Extension.zip`

## Open-source notices

Conteenua Companion includes MIT-licensed and other open-source components. Required copyright, license and bundled-source notices are preserved in [`LICENSE`](LICENSE) and [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt). The shipped product, package IDs, UI, connectors, extension, and releases are Conteenua Companion.

Conteenua is not affiliated with or endorsed by OpenAI. ChatGPT and OpenAI product names belong to OpenAI. Users are responsible for using connected services in accordance with their applicable terms and plan capabilities.
