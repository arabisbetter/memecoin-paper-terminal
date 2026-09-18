-- PAPER Part 4: KYC/AML, jurisdiction, tax-readiness and Turnkey custody foundation.
-- Real-money activation remains disabled. No identity documents or private keys are stored here.

create table if not exists public.paper_kyc_cases (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  provider text not null default 'sumsub' check (provider in ('sumsub')),
  applicant_id text unique,
  external_user_id text not null unique,
  level_name text,
  status text not null default 'not_started'
    check (status in ('not_started','token_issued','pending','approved','rejected','on_hold','resubmission_requested','deactivated')),
  review_answer text,
  review_reject_type text,
  reject_labels text[] not null default '{}'::text[],
  country_code text,
  age_verified boolean,
  aml_status text not null default 'not_checked'
    check (aml_status in ('not_checked','pending','clear','review','blocked')),
  sanctions_status text not null default 'not_checked'
    check (sanctions_status in ('not_checked','pending','clear','review','blocked')),
  provider_correlation_id text,
  last_webhook_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  last_aml_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.paper_kyc_cases enable row level security;
drop policy if exists paper_kyc_cases_read_own on public.paper_kyc_cases;
create policy paper_kyc_cases_read_own on public.paper_kyc_cases
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_kyc_cases from public,anon,authenticated;
grant select on public.paper_kyc_cases to authenticated;

create table if not exists public.paper_kyc_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  applicant_id text,
  provider text not null default 'sumsub',
  event_type text not null,
  review_status text,
  review_answer text,
  correlation_id text,
  verified_signature boolean not null default false,
  payload_summary jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique(provider,correlation_id,event_type)
);
alter table public.paper_kyc_events enable row level security;
revoke all on public.paper_kyc_events from public,anon,authenticated;
create index if not exists paper_kyc_events_user_time_idx on public.paper_kyc_events(user_id,received_at desc);
create index if not exists paper_kyc_events_applicant_idx on public.paper_kyc_events(applicant_id,received_at desc);

create table if not exists public.paper_jurisdiction_rules (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  region_code text,
  real_funded_allowed boolean not null default false,
  payouts_allowed boolean not null default false,
  min_age integer not null default 18 check (min_age between 18 and 100),
  legal_basis_note text,
  approved_by_counsel boolean not null default false,
  effective_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(country_code,region_code)
);
alter table public.paper_jurisdiction_rules enable row level security;
revoke all on public.paper_jurisdiction_rules from public,anon,authenticated;

create table if not exists public.paper_compliance_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  check_type text not null check (check_type in ('kyc','aml','sanctions','jurisdiction','age','duplicate_identity','tax_readiness')),
  status text not null check (status in ('pending','clear','review','blocked','expired')),
  provider text,
  provider_reference text,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.paper_compliance_checks enable row level security;
revoke all on public.paper_compliance_checks from public,anon,authenticated;
create index if not exists paper_compliance_checks_user_idx on public.paper_compliance_checks(user_id,check_type,checked_at desc);

create table if not exists public.paper_tax_status (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started','required','collecting','complete','review')),
  country_code text,
  form_type text,
  provider_reference text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.paper_tax_status enable row level security;
drop policy if exists paper_tax_status_read_own on public.paper_tax_status;
create policy paper_tax_status_read_own on public.paper_tax_status
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_tax_status from public,anon,authenticated;
grant select on public.paper_tax_status to authenticated;

create table if not exists public.paper_custody_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  funded_account_id uuid unique references public.paper_funded_accounts(id) on delete cascade,
  provider text not null default 'turnkey' check (provider in ('turnkey')),
  organization_id text,
  wallet_id text unique,
  wallet_account_address text unique,
  policy_ref text,
  status text not null default 'not_provisioned'
    check (status in ('not_provisioned','provisioning','active','suspended','closed','error')),
  key_export_allowed boolean not null default false check (key_export_allowed=false),
  arbitrary_transfer_allowed boolean not null default false check (arbitrary_transfer_allowed=false),
  principal_withdrawal_allowed boolean not null default false check (principal_withdrawal_allowed=false),
  last_signing_activity_at timestamptz,
  last_error text,
  provisioned_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.paper_custody_wallets enable row level security;
drop policy if exists paper_custody_wallets_read_own on public.paper_custody_wallets;
create policy paper_custody_wallets_read_own on public.paper_custody_wallets
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_custody_wallets from public,anon,authenticated;
grant select(id,user_id,funded_account_id,provider,wallet_account_address,status,provisioned_at,updated_at)
  on public.paper_custody_wallets to authenticated;

alter table public.paper_funded_profiles
  add column if not exists jurisdiction_country_code text,
  add column if not exists jurisdiction_region_code text,
  add column if not exists jurisdiction_status text not null default 'not_checked'
    check (jurisdiction_status in ('not_checked','allowed','blocked','review')),
  add column if not exists age_verified boolean not null default false,
  add column if not exists sanctions_status text not null default 'not_checked'
    check (sanctions_status in ('not_checked','clear','review','blocked')),
  add column if not exists aml_status text not null default 'not_checked'
    check (aml_status in ('not_checked','clear','review','blocked')),
  add column if not exists tax_status text not null default 'not_started'
    check (tax_status in ('not_started','required','collecting','complete','review')),
  add column if not exists preferred_payout_asset text not null default 'USDC'
    check (preferred_payout_asset in ('USDC','SOL')),
  add column if not exists compliance_checked_at timestamptz;

alter table public.paper_funded_profiles enable row level security;
drop policy if exists paper_funded_profiles_read_own on public.paper_funded_profiles;
create policy paper_funded_profiles_read_own on public.paper_funded_profiles
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_funded_profiles from public,anon,authenticated;
grant select(user_id,stage,kyc_status,kyc_provider,kyc_reference,kyc_verified_at,payout_wallet_address,
  payout_wallet_verified_at,approved_at,activated_at,updated_at,jurisdiction_country_code,
  jurisdiction_region_code,jurisdiction_status,age_verified,sanctions_status,aml_status,tax_status,
  preferred_payout_asset,compliance_checked_at,requalify_after)
on public.paper_funded_profiles to authenticated;

alter table public.paper_platform_flags enable row level security;
drop policy if exists paper_platform_flags_read on public.paper_platform_flags;
create policy paper_platform_flags_read on public.paper_platform_flags
  for select to authenticated using (true);
revoke all on public.paper_platform_flags from public,anon,authenticated;
grant select on public.paper_platform_flags to authenticated;

create or replace view public.paper_funded_readiness with (security_invoker=true) as
select
  fp.user_id,
  fp.stage,
  fp.kyc_status,
  fp.aml_status,
  fp.sanctions_status,
  fp.jurisdiction_status,
  fp.age_verified,
  fp.tax_status,
  fp.payout_wallet_verified_at,
  fp.preferred_payout_asset,
  kc.status as provider_kyc_status,
  kc.aml_status as provider_aml_status,
  kc.sanctions_status as provider_sanctions_status,
  cw.status as custody_status,
  cw.wallet_account_address,
  pf.legal_review_complete,
  pf.legal_entity_ready,
  pf.kyc_provider_configured,
  pf.aml_sanctions_controls_ready,
  pf.jurisdiction_allowlist_ready,
  pf.turnkey_signing_enabled,
  pf.custody_security_review_complete,
  pf.treasury_capital_available,
  pf.real_funded_activation,
  pf.real_payouts_enabled,
  (
    pf.legal_review_complete and pf.legal_entity_ready and pf.kyc_provider_configured and
    pf.aml_sanctions_controls_ready and pf.jurisdiction_allowlist_ready and
    pf.turnkey_signing_enabled and pf.custody_security_review_complete and
    pf.treasury_capital_available and pf.real_funded_activation and
    fp.kyc_status='verified' and fp.aml_status='clear' and fp.sanctions_status='clear' and
    fp.jurisdiction_status='allowed' and fp.age_verified
  ) as funded_ready
from public.paper_funded_profiles fp
join public.paper_platform_flags pf on pf.id=true
left join public.paper_kyc_cases kc on kc.user_id=fp.user_id
left join public.paper_custody_wallets cw on cw.user_id=fp.user_id;
revoke all on public.paper_funded_readiness from public,anon,authenticated;
grant select on public.paper_funded_readiness to authenticated;

-- Service-role only gate calculation. No client may use this to mutate compliance state.
create or replace function public.paper_real_money_gate_snapshot_v1(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'user_id',fp.user_id,
    'stage',fp.stage,
    'kyc_status',fp.kyc_status,
    'aml_status',fp.aml_status,
    'sanctions_status',fp.sanctions_status,
    'jurisdiction_status',fp.jurisdiction_status,
    'age_verified',fp.age_verified,
    'payout_wallet_verified',fp.payout_wallet_verified_at is not null,
    'custody_status',coalesce(cw.status,'not_provisioned'),
    'legal_review_complete',pf.legal_review_complete,
    'legal_entity_ready',pf.legal_entity_ready,
    'kyc_provider_configured',pf.kyc_provider_configured,
    'aml_sanctions_controls_ready',pf.aml_sanctions_controls_ready,
    'jurisdiction_allowlist_ready',pf.jurisdiction_allowlist_ready,
    'turnkey_signing_enabled',pf.turnkey_signing_enabled,
    'custody_security_review_complete',pf.custody_security_review_complete,
    'treasury_capital_available',pf.treasury_capital_available,
    'real_funded_activation',pf.real_funded_activation,
    'real_payouts_enabled',pf.real_payouts_enabled,
    'funded_ready',(
      pf.legal_review_complete and pf.legal_entity_ready and pf.kyc_provider_configured and
      pf.aml_sanctions_controls_ready and pf.jurisdiction_allowlist_ready and
      pf.turnkey_signing_enabled and pf.custody_security_review_complete and
      pf.treasury_capital_available and pf.real_funded_activation and
      fp.kyc_status='verified' and fp.aml_status='clear' and fp.sanctions_status='clear' and
      fp.jurisdiction_status='allowed' and fp.age_verified
    ),
    'payout_ready',(
      pf.real_payouts_enabled and fp.payout_wallet_verified_at is not null and
      fp.kyc_status='verified' and fp.aml_status='clear' and fp.sanctions_status='clear' and
      fp.jurisdiction_status='allowed' and fp.age_verified
    )
  )
  from public.paper_funded_profiles fp
  join public.paper_platform_flags pf on pf.id=true
  left join public.paper_custody_wallets cw on cw.user_id=fp.user_id
  where fp.user_id=p_user_id;
$$;
revoke all on function public.paper_real_money_gate_snapshot_v1(uuid) from public,anon,authenticated;
grant execute on function public.paper_real_money_gate_snapshot_v1(uuid) to service_role;

-- All launch gates remain off after schema installation.
update public.paper_platform_flags set
  kyc_provider_configured=false,
  aml_sanctions_controls_ready=false,
  jurisdiction_allowlist_ready=false,
  turnkey_signing_enabled=false,
  custody_security_review_complete=false,
  real_funded_activation=false,
  real_payouts_enabled=false,
  updated_at=now()
where id=true;
