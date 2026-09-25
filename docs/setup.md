# Setup

Private beta setup currently uses a development build and unpacked extension. Public users should eventually install a signed release and browser-store extension instead.

1. Install/run Conteenua Companion.
2. Sign in with the same Conteenua account used on web/mobile.
3. Add one or more local project folders. The local folder picker grants the approved-root permission.
4. Leave **Connection → Stable OpenAI tunnel (recommended)** selected.
5. In the OpenAI workspace you use with ChatGPT, create a persistent MCP tunnel and copy its `tunnel_…` ID.
6. Create a restricted OpenAI API key with only the tunnel permissions required by `tunnel-client` (the existing setup guide uses Tunnels **Read + Use**). Paste it once into Companion. It is stored using OS-backed secure storage; the renderer receives only a boolean saying a key is stored.
7. Choose **Save stable connector**, then **Connect local tools**. Companion reports tunnel readiness and keeps retrying without presenting a false green state.
8. In ChatGPT, enable Developer mode. Open **Plugins → Create app**, choose **Tunnel**, select the same persistent tunnel, choose **No Auth**, accept the developer warning, and create the **Conteenua Companion Core** plugin.
9. Pair/install the Conteenua Companion Extension with a normal ChatGPT tab.
10. Open Conteenua → **Code → Use your own AI**.
11. Choose the online computer and approved project.
12. Confirm ChatGPT reports writable local tools as available, then start the session.

### Temporary fallback

If a persistent OpenAI tunnel is not configured, Companion can use **Temporary Cloudflare fallback**. It verifies the generated quick-tunnel URL with a real public MCP `initialize` request before reporting connected. The URL can rotate after Companion restarts, so a ChatGPT developer plugin created in **Server URL** mode may need to be refreshed/recreated. This is a fallback/testing path, not the recommended durable setup.

If the user's ChatGPT workspace does not expose the required write-capable connector tools, Conteenua reports the limitation. It does not silently spend Conteenua AI credits or launch Codex as a substitute.

This feature therefore requires a ChatGPT account/workspace that exposes Developer mode plus writable custom plugin/MCP tools. Conteenua checks the connected account at runtime instead of assuming support from the plan name alone; unsupported accounts simply keep **Start coding** disabled.
