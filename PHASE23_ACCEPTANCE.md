# PAPER Parts 2–3 acceptance criteria

1. Active evaluations are marked server-side even with the browser closed.
2. Evaluation monitoring runs at least once per minute; staging target is every 30 seconds.
3. Only LIVE authoritative marks may change equity, drawdown, daily loss, pass or fail state.
4. Missing or unverifiable position prices produce UNAVAILABLE/DEGRADED state and never fabricated prices.
5. Evaluation expiration remains time-based during provider outages.
6. Provider health persists latency, failures and fallback state.
7. Risk output distinguishes verified data from heuristics.
8. Holder concentration and authority fields remain null/unknown when chain data is unavailable.
9. PAPER simulation remains available when a future funded-risk threshold is hit; the response/UI clearly shows the funded-buy block.
10. Helius and Jupiter integrations fail closed to degraded/unknown when secrets are absent.
11. A passed evaluation enters the funded waitlist without activating real money.
12. Two consecutive profitable cycles advance one scaling tier: $1K → $2.5K → $5K → $10K → $25K.
13. Leaderboards support weekly/all-time evaluation P&L, ROI, win rate, trades and funded P&L, with server-side opt-out.
14. Public trader profiles support follows, verified PAPER trade cards and activity sharing; posts/calls/comments/copy trading remain unavailable.
15. Admin mutation endpoints require both an admin role and AAL2 strong authentication.
16. Treasury state cannot exceed 60% deployed or fall below 40% reserve.
17. Duplicate payout-wallet use creates a hard funded-stage freeze; IP/device/wash-like heuristics remain review signals rather than proof.
18. Real-funded activation and payouts stay blocked until all launch gates and their explicit feature flags are true.
19. Payout actions above $2,000 require approval by a different admin.
20. Emergency pause prevents PAPER trades and new evaluation starts while existing evaluation monitoring continues.
21. Supabase security/performance advisors are reviewed after schema changes; intentionally private RLS tables may have no client policy/grants.
22. Next.js production build and CI pass before merge.
