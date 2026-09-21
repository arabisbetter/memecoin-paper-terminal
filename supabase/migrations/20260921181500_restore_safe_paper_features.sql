-- Restore safe PAPER-only features while keeping every real-money path database-locked.
-- A future reviewed migration must explicitly remove these triggers before any funded/custody/payout work can write.

update public.paper_control_plane
set evaluation_entries_enabled=true,
    social_enabled=true,
    funded_waitlist_enabled=false,
    updated_at=now()
where id=true;

update public.paper_platform_flags
set real_funded_activation=false,
    real_payouts_enabled=false,
    turnkey_signing_enabled=false,
    treasury_capital_available=false,
    kyc_provider_configured=false,
    legal_review_complete=false,
    custody_security_review_complete=false,
    updated_at=now()
where id=true;

create or replace function public.paper_beta_block_real_money_write_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  -- PAPER-only beta: silently suppress dormant real-money/funded/custody/payout writes.
  -- This deliberately lets PAPER-only evaluation completion succeed without creating
  -- a funded application or any payout/custody state.
  return null;
end;
$$;

revoke all on function public.paper_beta_block_real_money_write_v1() from public,anon,authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'paper_funded_profiles',
    'paper_funded_applications',
    'paper_funded_accounts',
    'paper_funded_orders',
    'paper_funded_fills',
    'paper_funded_settlements',
    'paper_funded_waitlist',
    'paper_funded_scale_state',
    'paper_funded_positions',
    'paper_funded_execution_events',
    'paper_funded_fee_ledger',
    'paper_funded_liquidation_queue',
    'paper_kyc_cases',
    'paper_kyc_events',
    'paper_jurisdiction_rules',
    'paper_compliance_checks',
    'paper_tax_status',
    'paper_custody_wallets',
    'weekly_prize_pools',
    'weekly_payouts',
    'payout_wallet_challenges'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists paper_beta_real_money_lock on public.%I',t);
      execute format(
        'create trigger paper_beta_real_money_lock before insert or update on public.%I for each row execute function public.paper_beta_block_real_money_write_v1()',
        t
      );
    end if;
  end loop;
end;
$$;
