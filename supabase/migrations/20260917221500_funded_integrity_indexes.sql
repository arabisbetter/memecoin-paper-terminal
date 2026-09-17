-- PAPER evaluation indexes and idempotent data integrity checks.

create unique index if not exists paper_funded_applications_one_live_per_user
  on public.paper_funded_applications(user_id)
  where status in ('pending_review','kyc_required','kyc_pending','approved','active');

create index if not exists paper_funded_accounts_status_idx
  on public.paper_funded_accounts(status,updated_at desc);

-- Future funded-account records remain one per user by the existing unique constraint.
-- Real activation is additionally blocked by paper_platform_flags and application/KYC state.
