-- Compatibility shim for production projects created before settlement
-- approval, payout, retry, and reset metadata were introduced.
alter table public.paper_funded_settlements
  add column if not exists payout_asset text not null default 'USDC' check (payout_asset in ('USDC','SOL')),
  add column if not exists payout_asset_amount numeric(40,16),
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists second_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists second_approved_at timestamptz,
  add column if not exists payout_broadcast_at timestamptz,
  add column if not exists payout_confirmation_slot bigint,
  add column if not exists payout_error text,
  add column if not exists reset_capital_usd numeric(20,8),
  add column if not exists reset_completed_at timestamptz,
  add column if not exists payout_network_fee_lamports bigint,
  add column if not exists payout_network_fee_usd numeric(20,8),
  add column if not exists payout_attempts integer not null default 0,
  add column if not exists payout_last_checked_at timestamptz;
