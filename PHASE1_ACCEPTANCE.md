# PAPER Phase 1 acceptance criteria

1. A normal anonymous PAPER user can still use paper-only trading after accepting current terms.
2. Evaluation entry requires a recoverable, non-anonymous account.
3. Starting an evaluation resets PAPER buying power to $1,000 only when there are no open USD-mode positions.
4. New evaluation attempts expire after 30 days; failed/expired attempts have a 24h retry cooldown.
5. Evaluation live equity is cash + server-fetched live marks for every open USD-mode position.
6. Missing required marks produce UNAVAILABLE/DEGRADED state; they must never be replaced with invented prices for qualification.
7. Trailing drawdown is 10% of peak live equity and the floor never moves down.
8. UTC daily loss is measured from the first authoritative equity mark of the UTC day and fails at $50.
9. Evaluation buys cannot exceed 25% of current live equity per single entry or per token, and cannot create more than five simultaneous open positions.
10. Evaluation passes automatically at $6,000 live equity with at least one recorded evaluation trade if no fail rule is breached.
11. Passing changes the future funded profile to KYC REQUIRED but does not activate real money.
12. Real-funded activation and real payouts remain false in server-controlled feature flags.
13. PAPER simulated trading fee is 1%.
14. Terms v2 / Risk v2 explicitly state 18+, free evaluation rules, and no promise of funding.
15. The Next.js production build and public-route smoke tests pass before merge.
