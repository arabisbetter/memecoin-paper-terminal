# PAPER Parts 2–3 status

## Part 2 — market data, risk and 24/7 evaluation monitoring

- **Always-on evaluation monitor:** implemented and ACTIVE on Supabase staging via pg_cron every 30 seconds.
- **Authoritative evaluation behavior:** only LIVE marks may move equity, trailing drawdown, daily loss, pass or fail state. DEGRADED/STALE/UNAVAILABLE observations preserve last trusted risk state; time-based expiration can still occur.
- **Market pricing:** DexScreener primary, Jupiter Price v3 fallback when JUPITER_API_KEY is configured, GeckoTerminal final fallback.
- **Provider health:** persisted status, latency, consecutive success/failure, last error and timestamps.
- **Risk scanner:** deployed to staging with liquidity, holder concentration when chain data is available, mint/freeze authority, creator/dev candidates, holder count when Helius is configured, dev-sell enrichment when Helius is configured, and explicitly labeled bundle/sniper/cluster heuristics.
- **Risk policy:** future real-funded buy block thresholds persisted server-side. PAPER simulation remains allowed with warning.
- **HELIUS_API_KEY:** integration is implemented but the dedicated Supabase staging project does not currently have a Helius secret configured. The scanner therefore uses public Solana RPC fallback and truthfully reports DEGRADED when RPC enrichment is unavailable/rate-limited.
- **JUPITER_API_KEY:** optional fallback integration implemented; staging secret is not currently configured.
- **Emergency controls:** risk scanning can be disabled independently; PAPER trading and new evaluation entry are bound to the control plane emergency pause.

## Part 3 — platform/control layer

- **Funded waitlist:** implemented and automatically populated after a rule-based evaluation pass.
- **Scaling:** $1K → $2.5K → $5K → $10K → $25K, advancing after two consecutive profitable settlement cycles.
- **Social v1:** public profiles, follows, verified PAPER trade cards and activity feed. Posts/calls/comments/copy trading remain disabled/deferred.
- **Privacy:** public-profile, leaderboard opt-out, activity sharing and PAPER P&L sharing controls with RLS enforcement.
- **Leaderboards:** weekly/all-time evaluation P&L, ROI, win rate, trades and funded P&L fields.
- **Admin control plane:** admin roles, audit log, overrides, second-approval queue, trader review feed, risk/provider health, emergency pause, abuse review, treasury state and launch-gate visibility.
- **Admin auth:** mutations require AAL2 MFA/passkey-strength session. No admin account is auto-seeded.
- **Treasury:** hard DB guardrail of max 60% deployed / min 40% reserve.
- **Abuse:** duplicate payout wallet is a hard funded-stage freeze; shared device/IP and repetitive same-token activity are soft/manual-review signals.
- **Second approval:** payout actions above $2,000 require a different admin approval before future execution.
- **Real money:** legal/KYC/custody/treasury/Turnkey/activation/payout gates all remain OFF.

## Staging evidence

- Cron schedule is ACTIVE at 30 seconds.
- Closed-browser monitor execution is verified.
- Missing-price evaluation test preserved $1,000 trusted equity, $1,000 peak, $900 floor, zero daily loss and ACTIVE status while reporting UNAVAILABLE.
- Two profitable cycles advanced a test scale state from $1,000 to $2,500 and set the next tier to $5,000.
- 70/30 treasury allocation was rejected by the database constraint.
- Leaderboard opt-out hid the target row under authenticated RLS.
- New evaluation activity trigger recorded a server-generated activity event.
- Risk scanner corrected a staging-discovered base/quote association bug: market pricing is accepted only when the returned base token exactly matches the requested mint.

## Production boundary

Production Supabase is still untouched by Parts 2–3. Do not apply these migrations or Edge Functions to production until the branch build/CI passes and production schema/grant review is repeated. Real-funded activation and payouts remain disabled regardless.
