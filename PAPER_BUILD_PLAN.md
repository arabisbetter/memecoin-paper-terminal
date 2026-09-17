# PAPER — Build Plan

## Product rule
PAPER-only trading/evaluation may launch publicly before real funded trading. Real funded activation, custody execution, and payouts remain server-feature-flagged OFF until KYC, legal/compliance, custody security, and capital-readiness gates are complete.

## Phase 1 — Public PAPER + authoritative evaluation (P0)
- $1,000 free evaluation account, +$5,000 target, 30-day window.
- 10% continuous trailing drawdown and $50 UTC realized+unrealized daily-loss cap.
- 25% single-entry/token concentration, max five simultaneous positions, min one trade.
- Server-authoritative live-equity marks; never use client-submitted fill/mark prices for qualification.
- 1% simulated fee so evaluation economics mirror the planned real platform fee.
- Recoverable email required before evaluation entry; anonymous PAPER-only use remains available.
- Evaluation dashboard, countdown, pass/fail state, 24h retry cooldown.
- Terms v2 / Risk v2 / 18+ evaluation gate.
- Security hardening around SECURITY DEFINER RPCs and funded controls.

**Exit gate:** build passes; evaluation rules are enforced server-side; staged database/function tests pass; no known P0 integrity failure.

## Phase 2 — Always-on market/risk ingestion
- Helius ingestion pipeline plus GeckoTerminal/DexScreener/Jupiter fallback.
- Always-on evaluation marking independent of an open browser.
- Real observed-trade candles for 1s/5s/15s/30s; gaps remain gaps.
- Server-side cached indicators: VWAP, EMA 9/21, Bollinger, RSI 14, MACD 12/26/9.
- Holder/rug intelligence: concentration, creator/dev holdings, authorities, LP state, sniper/bundle heuristics, dev sells, suspicious clusters.
- Pulse: New Pairs / Final Stretch (>=85% curve) / Migrated.

**Exit gate:** provider failure/degradation is visible; qualification cannot miss a material drawdown because a browser was closed.

## Phase 3 — Social + leaderboard + funded control plane
- Public profiles, follows, verified PAPER/funded trade cards, shareable P&L cards, activity feed.
- Evaluation/funded leaderboards: P&L, ROI, win rate; weekly/all-time; opt-out.
- Funding waitlist; one funded account per verified person.
- Scaling levels: $1K -> $2.5K -> $5K -> $10K -> $25K after two consecutive profitable payout cycles per tier.
- Admin dashboard, risk flags, treasury exposure, audit trail, emergency pause.
- Treasury deployment cap 60%, mandatory reserve 40%.

## Phase 4 — KYC + custody integration (feature-flagged)
- Select and integrate KYC/AML vendor after vendor account is actually created.
- Jurisdiction allowlist/denylist and sanctions controls.
- One Turnkey-controlled Solana wallet per funded account.
- No key export, arbitrary transfers, or principal withdrawal by traders.
- Pump.fun/PumpSwap execution with Jupiter routing; 3% default / 5% maximum slippage and priority fees.
- Risk blocklist and approved-program transaction policy.

**Exit gate:** external legal review, KYC readiness, custody security review, and production secrets management complete.

## Phase 5 — Real funded settlement/payout activation
- Initial funded principal $1,000.
- 15% trailing funded drawdown; 5% daily-loss cap; immediate close on breach.
- Friday 17:00 UTC settlement, flat positions required.
- Realized profit only, mandatory high-water mark, $25 minimum.
- 90% trader / 10% PAPER.
- USDC default, SOL optional; PAPER pays network fees.
- Automated calculation + admin approval; second approval over $2,000.
- Real transaction signature, confirmation polling, retry state, immutable audit record.

## Phase 6 — Production hardening / scale
- Separate dev/staging/production environments.
- Browser E2E tests, load/race/idempotency tests, backup/restore drill.
- Error/uptime/provider/data-latency monitoring and internal status dashboard.
- PWA readiness, performance profiling, incident runbooks.
- Tax-reporting data exports; filing integrations later.

## Deferred from v1
- `$PAPER` token and buybacks.
- Charity revenue commitment.
- In-house token launchpad.
- Posts/calls/comments/copy trading.
- Telegram/Discord notifications.
- Native mobile apps.
