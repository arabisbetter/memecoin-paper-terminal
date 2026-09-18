# PAPER evaluation service contract

`evaluation-status` accepts authenticated POST requests only.

- `{ "action": "status" }` returns the latest evaluation, server-authoritative mark when active, funded gate state, and locked v1 rules.
- `{ "action": "start" }` starts a free evaluation only for a recoverable non-anonymous account that accepted current legal versions.

Clients never submit fill prices, equity values, or pass/fail decisions.
