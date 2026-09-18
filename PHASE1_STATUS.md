# Phase 1 status

- Evaluation engine: **Deployed and acceptance-tested on dedicated Supabase staging.**
- Evaluation UI: **Implemented in branch.**
- 1% PAPER fee + evaluation risk enforcement: **Implemented in paper-trade v5; deployed source matches GitHub exactly on staging.**
- Recoverable-email evaluation gate: **Verified in staging; anonymous evaluation entry is blocked. X OAuth remains deferred until provider credentials exist.**
- Legal v2 / Compliance notes: **Implemented; missing current legal acceptance blocks evaluation entry.**
- Real funded trading/payouts: **Feature-flagged OFF by design; verified false in staging after pass-to-KYC flow.**
- Staging validation: **$1,000 reset, 30-day window, 24h cooldown, 10% trailing drawdown, $50 UTC daily loss, one-trade minimum, automatic $6,000 pass-to-KYC, open-position reset block, and real-money kill switches verified.**
- Security validation: **Supabase staging exposed default TRUNCATE/REFERENCES/TRIGGER grants on newly created client-facing tables; migrations were hardened to revoke all client table privileges first and grant back only intended authenticated SELECT access. Evaluation RLS predicates and user/time indexes were also tightened.**
- Edge Functions: **evaluation-status v1 and paper-trade v1 ACTIVE in staging with JWT verification enabled.**

The dedicated staging project is a compatibility reconstruction of the production PAPER schema because Supabase development branching is unavailable on the current plan. Production remains untouched.

Before production merge: require the updated branch CI to pass and repeat the migration/advisor checks against the real production schema in a non-mutating review.
