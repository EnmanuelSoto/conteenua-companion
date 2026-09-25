# Contributing to Conteenua Companion

Conteenua Companion is an open-source local bridge for Conteenua's bring-your-own-AI coding path.

Before proposing changes, preserve these invariants:

- **Use your own AI never charges Conteenua AI credits.**
- Repository contents and local paths stay local by default.
- Cloud project IDs never grant filesystem permission.
- The renderer never receives unrestricted filesystem, shell, credential, or arbitrary-IPC authority.
- Provider adapters may report unavailable capabilities; they must not bypass provider plan/account restrictions.
- Ambiguous mutating actions are not automatically retried.
- Required MIT and third-party notices stay intact.

Run at least:

```bash
npm run typecheck
npm run build
```

Security-sensitive changes to sandboxing, terminal execution, browser pairing, cloud command ownership, or credential storage should include focused tests and a short threat-model note in the pull request.
