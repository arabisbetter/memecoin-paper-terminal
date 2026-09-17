# Server secrets

PAPER uses provider credentials only from server-side secret storage.

- Helius keys: server-side only.
- Supabase service-role/secret keys: server-side only.
- Turnkey private API credentials: server-side only, never `NEXT_PUBLIC_*`, never client bundles, never logs/source control.
- The previously exposed Turnkey API key was rotated and must never be reused.

Production custody credentials must be added only after the custody security review and real-funded launch gates are cleared.
