# PAPER production rollout runbook

## 0. Hard stop conditions

Do not activate funded trading or payouts if any item below is unresolved:

- legal review or legal entity gate false;
- KYC/AML/sanctions/jurisdiction gate false;
- Turnkey/custody security review false;
- treasury capital gate false;
- Supabase project lacks acceptable backups/recovery;
- leaked-password protection disabled;
- no owner/admin account with MFA/AAL2;
- no validated preview deployment/rollback target;
- provider credentials missing;
- incident/kill-switch path untested.

## 1. Infrastructure readiness

1. Production Supabase must be on a backup-capable plan or have an independently tested off-site backup process.
2. Prefer daily backups plus PITR where the business recovery objective requires it.
3. Enable leaked-password protection in Supabase Auth.
4. Review database access/network restrictions and team access.
5. Configure production secrets only in Vercel/Supabase secret storage.
6. Configure a dedicated Turnkey payout treasury organization/policy/wallet separately from trader custody.
7. Create the production owner/admin account and require AAL2.

## 2. Build and preview

1. CI must pass from the exact commit intended for production.
2. Deploy that exact artifact to a Vercel preview.
3. Verify:
   - public market routes;
   - auth/onboarding;
   - paper trading;
   - evaluation start/status;
   - leaderboard/profile privacy;
   - funded workspace with real-money gates OFF;
   - admin dashboard;
   - `/api/health`.
4. Scan preview runtime errors.
5. Record preview deployment ID/URL as the rollback candidate.

## 3. Production database migration order

Apply only the PR delta, in this order:

1. `20260917220000_evaluation_engine_v1.sql`
2. `20260917220500_security_hardening_v1.sql`
3. `20260917221000_real_money_launch_gates.sql`
4. `20260917221500_funded_integrity_indexes.sql`
5. `20260918030000_paper_market_risk_monitor_v1.sql`
6. `20260918031000_paper_platform_control_v1.sql`
7. `20260918040000_part4_compliance_custody.sql`
8. `20260918041000_part5_funded_execution.sql`
9. `20260918050000_part6_production_hardening.sql`
10. `20260918051000_part6_performance_cleanup.sql`

After each migration, verify success before moving to the next. Do not enable any real-money flag during migration.

## 4. Edge Functions

Deploy the branch versions of:
- paper-trade
- evaluation-status
- evaluation-monitor
- market-risk-scan
- admin-control
- kyc-session
- kyc-webhook
- custody-provision
- funded-monitor

Verify JWT configuration matches each function's intended auth model.

## 5. Application deploy

Promote the already-tested Vercel preview artifact rather than rebuilding a different commit.

Immediately verify:
- homepage;
- paper trade;
- evaluation flow;
- health endpoint;
- admin dashboard;
- emergency pause;
- provider health.

## 6. Real-money activation

Keep `PAPER_REAL_MONEY_SERVER_ENABLED=false` until every database gate is verified.

When authorized to launch, open gates deliberately and record each change in the admin audit log. Enable the application server kill switch last.

Suggested sequence:
1. legal review
2. legal entity
3. KYC provider
4. AML/sanctions controls
5. jurisdiction allowlist
6. custody security review
7. Turnkey signing
8. treasury capital
9. real funded activation
10. real payouts
11. `PAPER_REAL_MONEY_SERVER_ENABLED=true`

## 7. Rollback

If application errors occur without database corruption:
1. set emergency pause;
2. set application real-money switch false;
3. promote/rollback to the last known-good Vercel deployment;
4. keep database gates false until incident review.

If data integrity is in doubt:
1. emergency pause immediately;
2. stop real-money server execution;
3. preserve logs/audit evidence;
4. stop automated settlement/execution as needed;
5. restore only using the documented database recovery procedure;
6. reconcile every funded order/payout signature before resuming.

Never solve a production incident by deleting/recreating funded rows or manually editing balances without an auditable reconciliation.
