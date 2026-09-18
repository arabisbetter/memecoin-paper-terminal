# PAPER disaster recovery and incident plan

## Recovery objectives

Before real-money launch, define business-approved RPO/RTO targets. PAPER should not claim a recovery objective that the actual Supabase plan cannot provide.

Current staging organization plan: Free. Supabase recommends regular external dumps for Free projects; automatic daily backups are documented for Pro, Team and Enterprise.

## Backup requirements before funded launch

- Production database backup capability verified.
- Restore procedure tested on a separate non-production project.
- Edge Function source is fully represented in Git.
- Vercel deployment ID for the last known-good release is recorded.
- Provider configuration and secret inventory is documented without storing secret values in Git.
- Turnkey organization/policy/wallet IDs are documented separately from private keys.
- Any Storage objects requiring recovery have a separate backup plan because database backups do not restore deleted Storage object contents.

## Incident classes

### Provider outage
- Preserve last authoritative marks.
- Mark data DEGRADED/UNAVAILABLE.
- Do not fabricate prices.
- Continue time-based evaluation expiration.
- Block funded buys that require fresh risk/price data.
- Do not fail accounts because a provider is unavailable.

### Market/risk monitor outage
- Emergency pause funded buys if heartbeats become stale.
- Investigate cron and Edge Function health.
- Resume only after two consecutive healthy monitor cycles.

### Trade execution uncertainty
- Reconcile order by idempotency key and on-chain signature before retrying.
- Never construct a replacement order if the original can still settle.

### Payout uncertainty
- Check the persisted signed payout artifact and its signature.
- If the transaction is still valid, rebroadcast the same signed bytes.
- If confirmed, finalize accounting exactly once.
- Never create a second payout transaction until the first signature is proven failed/expired and the incident is reviewed.

### Database corruption/data-loss
- Pause platform and disable the application real-money switch.
- Preserve logs and external provider/on-chain records.
- Restore to a separate environment first when possible.
- Reconcile funded balances, orders and payouts against on-chain signatures before reopening.

## Post-incident

- record incident timeline;
- identify affected users/orders/payouts;
- preserve audit rows;
- document root cause and corrective action;
- run security/performance advisors;
- rerun Parts 1–6 acceptance checks before re-enabling real money.
