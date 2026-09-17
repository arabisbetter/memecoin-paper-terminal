-- This migration documents real-money launch gates beyond the public evaluation engine.
-- It is intentionally data-only and defaults every gate to false.

alter table public.paper_platform_flags
  add column if not exists legal_review_complete boolean not null default false,
  add column if not exists legal_entity_ready boolean not null default false,
  add column if not exists aml_sanctions_controls_ready boolean not null default false,
  add column if not exists jurisdiction_allowlist_ready boolean not null default false,
  add column if not exists custody_security_review_complete boolean not null default false,
  add column if not exists treasury_capital_available boolean not null default false;

update public.paper_platform_flags set
  legal_review_complete=false,
  legal_entity_ready=false,
  kyc_provider_configured=false,
  aml_sanctions_controls_ready=false,
  jurisdiction_allowlist_ready=false,
  custody_security_review_complete=false,
  turnkey_signing_enabled=false,
  treasury_capital_available=false,
  real_funded_activation=false,
  real_payouts_enabled=false,
  updated_at=now()
where id=true;
