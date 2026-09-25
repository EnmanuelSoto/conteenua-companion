# Conteenua Companion security

Conteenua Companion sits between an AI conversation and the logged-in operating-system user. Treat it as high-privilege local software.

## Trust boundaries

The Electron renderer has context isolation enabled, Node integration disabled, navigation blocked, permission requests denied, and a fixed preload IPC surface. The renderer cannot invoke arbitrary IPC channel names, read local paths directly, or spawn arbitrary processes by itself.

Model-facing file operations are limited to folders the user explicitly approves. Project selection does not independently widen that approval. Canonical-path checks are revalidated locally so a cloud project ID is never authority to access a different folder.

Terminal execution is different: commands execute as the logged-in OS user. Once a command starts, the operating system—not the approved-folder model—defines what that process can reach. This is why command execution is a separate permission and why high-risk remote actions should require approval.

## Cloud control

The companion initiates an outbound authenticated Supabase connection. Users do not need to expose an inbound router port for Conteenua remote control. The cloud control plane carries device presence, project metadata, session commands, approval decisions, and safe activity summaries. It is not intended to proxy repository files or full terminal streams.

Every cloud row is scoped to the authenticated Conteenua user through Row Level Security. Device revocation marks the machine offline and prevents new commands from being accepted after the companion observes the revoked state.

## Credentials

Conteenua account refresh credentials are stored using Electron `safeStorage`, backed by DPAPI on Windows, Keychain on macOS, and a supported desktop secret store on Linux. An insecure Linux hard-coded-key fallback is rejected.

ChatGPT authentication stays in the user's browser. Conteenua Companion does not request or upload OpenAI passwords, browser cookies, or ChatGPT session tokens.

## Provider limitations

Conteenua Companion does not bypass ChatGPT plan/workspace limits. Official write-capable MCP is used only when it is actually available to the user's ChatGPT workspace. The browser bridge can open/steer a normal ChatGPT conversation, but it does not manufacture connector permissions the account does not have.

Browser UI automation is more fragile than a documented API and can change when the provider changes its UI. It is isolated behind a provider adapter so it can be disabled or replaced without changing device/project security.

## Reporting a vulnerability

Do not open a public issue containing credentials, private repository contents, browser session material, or exploit details. Use the GitHub repository's private security-advisory flow once the public repository is available, or contact `security@conteenua.com`.

## Release hardening

Public releases should be code-signed on Windows and signed/notarized on macOS before the companion is presented as generally available. Unsigned development builds are for private testing only.

On Linux, the AppImage uses Chromium's sandbox when the host supports unprivileged user namespaces. The generated launcher may use `--no-sandbox` only when that kernel capability is unavailable; this is a compatibility fallback with weaker renderer isolation, not the preferred configuration. Users should enable unprivileged user namespaces where possible instead of relying on the fallback.
