-- Phase 1 PAPER-only beta hard lock.
-- Real-money activation requires a future reviewed migration that explicitly removes this lock.

update public.paper_platform_flags
set real_funded_activation=false,
    real_payouts_enabled=false,
    turnkey_signing_enabled=false,
    treasury_capital_available=false,
    kyc_provider_configured=false,
    legal_review_complete=false,
    legal_entity_ready=false,
    aml_sanctions_controls_ready=false,
    jurisdiction_allowlist_ready=false,
    custody_security_review_complete=false,
    updated_at=now()
where id=true;

update public.paper_control_plane
set evaluation_entries_enabled=false,
    funded_waitlist_enabled=false,
    social_enabled=false,
    updated_at=now()
where id=true;

alter table public.paper_platform_flags
  drop constraint if exists paper_platform_flags_beta_real_money_off;
alter table public.paper_platform_flags
  add constraint paper_platform_flags_beta_real_money_off
  check (
    real_funded_activation=false
    and real_payouts_enabled=false
    and turnkey_signing_enabled=false
    and treasury_capital_available=false
  );

drop policy if exists legal_acceptances_insert_own on public.legal_acceptances;
revoke insert on table public.legal_acceptances from anon, authenticated;

revoke execute on function public.paper_apply_for_funded() from public, anon, authenticated;
revoke execute on function public.paper_set_funded_payout_wallet(text) from public, anon, authenticated;
revoke execute on function public.paper_get_funded_qualification() from public, anon, authenticated;
revoke execute on function public.paper_funded_preflight_v1(uuid,text,text,numeric,integer) from public, anon, authenticated;
