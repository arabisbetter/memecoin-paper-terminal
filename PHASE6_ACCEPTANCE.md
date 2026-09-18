# PAPER Part 6 acceptance criteria

1. Revoked or expired Supabase sessions are rejected by evaluation, funded-trade, payout and admin mutation paths.
2. Admin mutations require active AAL2 when strong auth is required.
3. Evaluation-start cannot create duplicate active evaluations under retry/concurrency.
4. Old authenticated access to privileged evaluation-start RPC is revoked.
5. Sensitive service RPCs remain service-role only.
6. Evaluation starts are rate-limited.
7. Admin mutations are rate-limited.
8. Funded trades are rate-limited after idempotency lookup.
9. Payout execution is rate-limited after paid/idempotent lookup.
10. Sensitive route request bodies have explicit size caps.
11. Evaluation and funded monitors emit operational heartbeats.
12. Health snapshot includes cron jobs and latest monitor state.
13. Public health endpoint exposes no provider secrets or service credentials.
14. Operational cleanup runs on a daily cron.
15. Admin/funded routes are no-store.
16. HSTS and baseline security headers are enabled.
17. Top-level dependency versions are exact.
18. CI GitHub actions are commit-SHA pinned.
19. CI rejects accidental public secret names.
20. CI runs a production-dependency security audit and fails on high/critical findings.
21. The high-severity legacy SPL-token dependency path is removed rather than suppressed.
22. CI uses a committed package lock and `npm ci`.
23. Parts 2–6 plus Part 6 performance cleanup appear in staging migration history.
24. Security advisors show no signed-in-user executable privileged SECURITY DEFINER functions.
25. All real-money launch flags remain false after testing.
26. A rollback-only evaluation-start test produces one attempt/reset under repeated start calls.
27. A rollback-only funded suite remains green from Parts 4–5.
28. Production database is not modified during Part 6 preparation.
29. Production real-money launch is blocked until backup, leaked-password protection, provider secrets, admin MFA and deployment rollback readiness are cleared.
