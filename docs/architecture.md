# Architecture

```text
Conteenua web / mobile
        |
        | authenticated Supabase control plane
        v
Conteenua Companion (outbound connection)
        |
        +-- approved local projects
        +-- terminal/process manager
        +-- local MCP surfaces
        +-- provider adapters
                |
                +-- normal ChatGPT / official MCP when available
                +-- normal ChatGPT / browser bridge
```

The cloud plane is deliberately metadata-oriented. Local paths, repository contents, shell environment and ChatGPT browser credentials do not become normal Supabase state.

## Provider abstraction

Local coding providers implement a narrow contract for availability, start, follow-up, stop/pause/resume and open-session behavior. ChatGPT-specific browser behavior is therefore replaceable rather than embedded in project, device or cloud code.

## Session identity

Conteenua owns a cloud remote-session UUID. The companion maps it to the existing durable local session ID. ChatGPT conversation IDs remain frontend references and may change through compaction/resume without changing the cloud session identity.

## Command delivery

Commands are persisted in `conteenua_companion_commands` before delivery. Realtime reduces latency; polling is the durable fallback. A companion atomically claims a queued command before execution, preventing duplicate execution from Realtime/poll races.
