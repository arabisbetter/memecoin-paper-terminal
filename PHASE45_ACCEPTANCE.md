# PAPER Parts 4–5 acceptance criteria

1. Passing an evaluation does not itself activate real money.
2. KYC can start only for a recoverable, evaluation-qualified account.
3. Sumsub webhook state changes are accepted only after a valid raw-body HMAC digest.
4. PAPER does not store KYC document images, raw document numbers, selfies or provider private source files.
5. KYC approval alone cannot activate funding: AML, sanctions, age, jurisdiction, legal, custody and treasury gates remain independent.
6. Real-funded jurisdictions fail closed unless counsel has affirmatively approved an effective rule.
7. Custody provisioning is owner/admin only and requires AAL2.
8. Funded custody wallets cannot be marked key-exportable, arbitrary-transfer capable or principal-withdrawable.
9. A funded account activates at its approved scale tier and consumes treasury deployment capacity.
10. Treasury policy remains max 60% deployed / min 40% reserve.
11. Funded max daily loss is 5% of funded capital and resets on the UTC date boundary.
12. Funded trailing drawdown is continuous at 15% of peak live equity.
13. Risk breach immediately closes the funded account and sets a 14-day requalification cooldown.
14. Only LIVE authoritative marks can move funded risk state.
15. Buy preflight enforces <=25% equity per entry/token and <=5 open positions.
16. Future funded buys require a fresh LIVE risk snapshot and are rejected when the risk engine marks the token blocked.
17. Protocol fee is 1%; default slippage is 3%; hard slippage maximum is 5%.
18. Real trade signing requires the independent server kill switch plus every database launch gate.
19. Funded trading keys are never sent to the browser.
20. Friday settlement is scheduled for 17:00 UTC and requires all positions flat.
21. Settlement uses high-water-mark eligible profit with a $25 trader-share minimum.
22. Settlement split is 90% trader / 10% PAPER.
23. USDC is default payout asset; SOL is optional.
24. Every payout requires an admin approval; payouts over $2,000 require a second different admin.
25. Payout destination is the cryptographically verified wallet captured by the settlement.
26. Payout finalization rechecks KYC/AML/sanctions/jurisdiction/age, tax readiness, abuse state, account status and flat positions.
27. Payout signer uses a dedicated Turnkey treasury wallet/policy, separate from trader custody.
28. Signed payout bytes and their expected signature are persisted server-only before broadcast for idempotent reconciliation.
29. A retry never silently constructs a second payment while an earlier signed transaction can still land.
30. Confirmed payouts record transaction signature, slot, asset amount and network fee.
31. After payout the account resets to the current scale capital instead of compounding.
32. All real-money feature flags remain false after staging acceptance tests.
33. No persistent funded account, settlement or signed payout artifact is left behind by rollback tests.
34. Supabase security/performance advisors and Next.js production CI must pass before production merge.
