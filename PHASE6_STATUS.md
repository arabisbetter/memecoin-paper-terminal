# PAPER Part 6 — production hardening status

## Completed in staging

- Sensitive Supabase SECURITY DEFINER entry points are service-role only.
- Evaluation start moved to a service-only v2 RPC with a per-user advisory lock.
- Direct authenticated execution of the old evaluation-start RPC is revoked.
- Active Supabase session validation now checks `auth.sessions` so revoked/expired sessions fail immediately.
- Admin mutation sessions require an active AAL2 session when strong auth is configured.
- Funded trading and payout routes validate active sessions server-side.
- Server-side fixed-window rate limits protect evaluation start, admin mutations, funded trades and payouts.
- Sensitive request bodies are capped before JSON parsing.
- Evaluation/funded monitor heartbeats are persisted for operations.
- Internal health snapshot includes cron state, monitor state, provider health and real-money gate state.
- Public `/api/health` returns only coarse operational status and never secrets.
- Daily operational retention cleanup is scheduled.
- Security headers include HSTS, no-sniff, frame denial, strict referrer policy, permissions policy and no-store rules for admin/funded surfaces.
- Top-level application dependencies are exact-version pinned.
- `package-lock.json` is committed and CI installs with deterministic `npm ci`.
- GitHub Actions checkout/setup-node actions are pinned to commit SHAs.
- CI scans for accidental NEXT_PUBLIC secret names and fails on high/critical production dependency advisories.
- The legacy `@solana/spl-token` client was removed after CI exposed its high-severity `bigint-buffer` dependency path. Standard USDC ATA + TransferChecked instructions are constructed directly with the Solana program interfaces instead.
- Remaining legacy `@solana/web3.js` audit findings are moderate and remain visible; migration to Solana Kit is a future dependency-hardening task rather than an audit suppression.
- Parts 2–6 plus the Part 6 performance cleanup are recorded in staging migration history.

## Verified controls

- Rate-limit test: requests 1–3 allowed; request 4 blocked.
- Nonexistent/revoked session test: rejected.
- AAL2 session validation: accepted only after session assurance level is aal2.
- Evaluation-start idempotency: two starts produced one active evaluation, one attempt and one reset ledger entry.
- Evaluation/funded cron jobs are active at 30 seconds.
- Friday funded settlement cron remains active at 17:00 UTC.
- Operational prune cron is active daily.
- Real-money gates remain false.
- Staging remains free of real funded accounts, settlements and signed payout artifacts after rollback tests.

## Platform-level findings that code cannot clear

1. Supabase organization is currently on the Free plan. Supabase documents automatic daily backups for Pro/Team/Enterprise; a real-money production project must not launch on Free without an independently operated backup process.
2. Leaked-password protection is disabled in Supabase Auth and must be enabled from project Auth settings before production.
3. `pg_net` is installed in `public` and is not relocatable on this project build. This is a Supabase advisor warning that cannot be fixed safely with `ALTER EXTENSION ... SET SCHEMA`.
4. The connected Vercel team currently exposes no project through the Vercel connector, so preview/production deployment, environment verification and rollback testing cannot be completed through the connected Vercel account yet.
5. Real Sumsub, Turnkey, Jupiter, Helius/private RPC and payout-treasury credentials are intentionally not configured.
6. No production owner/admin account is auto-created.

## Production boundary

Production Supabase remains untouched. No real-money flag or application server switch is enabled by Part 6.
