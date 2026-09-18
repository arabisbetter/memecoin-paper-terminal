-- PAPER Part 5: real funded execution, continuous risk and Friday settlement engine.
-- Code paths are installed but unreachable while real-money launch gates remain false.

alter table public.paper_funded_profiles
  add column if not exists requalify_after timestamptz;

alter table public.paper_funded_accounts
  add column if not exists cash_usd numeric(20,8) not null default 0,
  add column if not exists peak_equity_usd numeric(20,8) not null default 0,
  add column if not exists trailing_floor_usd numeric(20,8) not null default 0,
  add column if not exists daily_anchor_date date not null default ((now() at time zone 'utc')::date),
  add column if not exists daily_anchor_equity_usd numeric(20,8) not null default 0,
  add column if not exists daily_loss_usd numeric(20,8) not null default 0,
  add column if not exists current_drawdown_pct numeric(8,4) not null default 0,
  add column if not exists max_position_pct numeric(8,4) not null default 25
    check (max_position_pct>0 and max_position_pct<=100),
  add column if not exists max_single_trade_pct numeric(8,4) not null default 25
    check (max_single_trade_pct>0 and max_single_trade_pct<=100),
  add column if not exists max_open_positions integer not null default 5 check (max_open_positions>=1),
  add column if not exists default_slippage_bps integer not null default 300
    check (default_slippage_bps between 1 and 500),
  add column if not exists max_slippage_bps integer not null default 500
    check (max_slippage_bps between 1 and 500),
  add column if not exists protocol_fee_bps integer not null default 100
    check (protocol_fee_bps between 0 and 1000),
  add column if not exists last_mark_at timestamptz,
  add column if not exists data_status text not null default 'UNAVAILABLE'
    check (data_status in ('LIVE','DEGRADED','STALE','UNAVAILABLE')),
  add column if not exists breach_reason text,
  add column if not exists closed_at timestamptz;

update public.paper_funded_accounts set
  cash_usd=case when cash_usd=0 then capital_usd else cash_usd end,
  current_equity_usd=case when current_equity_usd=0 then capital_usd else current_equity_usd end,
  high_water_mark_usd=case when high_water_mark_usd=0 then capital_usd else high_water_mark_usd end,
  peak_equity_usd=case when peak_equity_usd=0 then greatest(capital_usd,current_equity_usd) else peak_equity_usd end,
  trailing_floor_usd=case when trailing_floor_usd=0 then greatest(capital_usd,current_equity_usd)*0.85 else trailing_floor_usd end,
  daily_anchor_equity_usd=case when daily_anchor_equity_usd=0 then greatest(capital_usd,current_equity_usd) else daily_anchor_equity_usd end
where capital_usd>0;

alter table public.paper_funded_orders
  add column if not exists input_mint text,
  add column if not exists output_mint text,
  add column if not exists slippage_bps integer not null default 300
    check (slippage_bps between 1 and 500),
  add column if not exists protocol_fee_bps integer not null default 100
    check (protocol_fee_bps between 0 and 1000),
  add column if not exists quote_provider text,
  add column if not exists route_labels text[] not null default '{}'::text[],
  add column if not exists price_impact_pct numeric(12,6),
  add column if not exists expected_out_amount_atomic text,
  add column if not exists actual_out_amount_atomic text,
  add column if not exists quote_snapshot jsonb,
  add column if not exists quote_expires_at timestamptz,
  add column if not exists signed_at timestamptz,
  add column if not exists broadcast_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmation_slot bigint,
  add column if not exists network_fee_lamports bigint,
  add column if not exists last_error text;

alter table public.paper_funded_accounts enable row level security;
drop policy if exists paper_funded_accounts_read_own on public.paper_funded_accounts;
create policy paper_funded_accounts_read_own on public.paper_funded_accounts
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_funded_accounts from public,anon,authenticated;
grant select(
  id,user_id,status,capital_usd,cash_usd,current_equity_usd,high_water_mark_usd,
  peak_equity_usd,trailing_floor_usd,daily_loss_usd,current_drawdown_pct,
  max_daily_loss_pct,max_total_drawdown_pct,max_position_pct,max_single_trade_pct,
  max_open_positions,default_slippage_bps,max_slippage_bps,protocol_fee_bps,
  trading_wallet_address,data_status,breach_reason,activated_at,last_mark_at,closed_at,updated_at
) on public.paper_funded_accounts to authenticated;

alter table public.paper_funded_orders enable row level security;
drop policy if exists paper_funded_orders_read_own on public.paper_funded_orders;
create policy paper_funded_orders_read_own on public.paper_funded_orders
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_funded_orders from public,anon,authenticated;
grant select(
  id,funded_account_id,user_id,token_address,side,requested_notional_usd,status,idempotency_key,
  tx_signature,rejection_reason,created_at,updated_at,slippage_bps,protocol_fee_bps,
  quote_provider,route_labels,price_impact_pct,expected_out_amount_atomic,actual_out_amount_atomic,
  signed_at,broadcast_at,confirmed_at,confirmation_slot,last_error
) on public.paper_funded_orders to authenticated;

alter table public.paper_funded_fills enable row level security;
drop policy if exists paper_funded_fills_read_own on public.paper_funded_fills;
create policy paper_funded_fills_read_own on public.paper_funded_fills
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_funded_fills from public,anon,authenticated;
grant select on public.paper_funded_fills to authenticated;

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

alter table public.paper_funded_settlements enable row level security;
drop policy if exists paper_funded_settlements_read_own on public.paper_funded_settlements;
create policy paper_funded_settlements_read_own on public.paper_funded_settlements
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_funded_settlements from public,anon,authenticated;
grant select(
  id,funded_account_id,user_id,week_start,week_end,opening_high_water_mark_usd,closing_equity_usd,
  eligible_profit_usd,trader_share_usd,paper_share_usd,status,payout_wallet_snapshot,
  payout_asset,payout_asset_amount,payout_tx_signature,created_at,approved_at,
  payout_broadcast_at,payout_confirmation_slot,payout_error,paid_at,reset_capital_usd,reset_completed_at
) on public.paper_funded_settlements to authenticated;

create table if not exists public.paper_funded_positions (
  id uuid primary key default gen_random_uuid(),
  funded_account_id uuid not null references public.paper_funded_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_address text not null,
  token_symbol text,
  quantity_tokens numeric(40,16) not null default 0 check (quantity_tokens>=0),
  cost_basis_usd numeric(20,8) not null default 0 check (cost_basis_usd>=0),
  average_entry_price_usd numeric(30,16) not null default 0 check (average_entry_price_usd>=0),
  realized_pnl_usd numeric(20,8) not null default 0,
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(funded_account_id,token_address)
);
alter table public.paper_funded_positions enable row level security;
drop policy if exists paper_funded_positions_read_own on public.paper_funded_positions;
create policy paper_funded_positions_read_own on public.paper_funded_positions
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.paper_funded_positions from public,anon,authenticated;
grant select on public.paper_funded_positions to authenticated;
create index if not exists paper_funded_positions_user_status_idx
  on public.paper_funded_positions(user_id,status,updated_at desc);

create table if not exists public.paper_funded_execution_events (
  id bigint generated always as identity primary key,
  order_id uuid references public.paper_funded_orders(id) on delete cascade,
  funded_account_id uuid references public.paper_funded_accounts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  event_type text not null,
  provider text,
  tx_signature text,
  confirmation_slot bigint,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.paper_treasury_state
  add column if not exists cumulative_network_fees_usd numeric(24,8) not null default 0;

create table if not exists public.paper_funded_fee_ledger (
  id bigint generated always as identity primary key,
  order_id uuid not null unique references public.paper_funded_orders(id) on delete cascade,
  funded_account_id uuid not null references public.paper_funded_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  protocol_fee_usd numeric(20,8) not null default 0 check (protocol_fee_usd>=0),
  network_fee_usd numeric(20,8) not null default 0 check (network_fee_usd>=0),
  created_at timestamptz not null default now()
);
alter table public.paper_funded_fee_ledger enable row level security;
revoke all on public.paper_funded_fee_ledger from public,anon,authenticated;
create index if not exists paper_funded_fee_account_idx on public.paper_funded_fee_ledger(funded_account_id,created_at desc);

create table if not exists public.paper_funded_liquidation_queue (
  id uuid primary key default gen_random_uuid(),
  funded_account_id uuid not null references public.paper_funded_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position_id uuid not null references public.paper_funded_positions(id) on delete cascade,
  token_address text not null,
  reason text not null,
  status text not null default 'queued' check (status in ('queued','processing','confirmed','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique(position_id,status)
);
alter table public.paper_funded_liquidation_queue enable row level security;
revoke all on public.paper_funded_liquidation_queue from public,anon,authenticated;
create index if not exists paper_funded_liquidation_status_idx on public.paper_funded_liquidation_queue(status,created_at);
create index if not exists paper_funded_liquidation_account_idx on public.paper_funded_liquidation_queue(funded_account_id,created_at);
create index if not exists paper_funded_liquidation_user_idx on public.paper_funded_liquidation_queue(user_id,created_at);

alter table public.paper_funded_execution_events enable row level security;
revoke all on public.paper_funded_execution_events from public,anon,authenticated;
create index if not exists paper_funded_execution_order_idx
  on public.paper_funded_execution_events(order_id,created_at desc);
create index if not exists paper_funded_execution_user_idx
  on public.paper_funded_execution_events(user_id,created_at desc);
create index if not exists paper_funded_execution_account_idx
  on public.paper_funded_execution_events(funded_account_id,created_at desc);
create index if not exists paper_funded_fee_user_idx
  on public.paper_funded_fee_ledger(user_id,created_at desc);
create index if not exists paper_funded_fee_account_idx
  on public.paper_funded_fee_ledger(funded_account_id,created_at desc);
create index if not exists paper_funded_fills_account_idx
  on public.paper_funded_fills(funded_account_id,filled_at desc);
create index if not exists paper_funded_fills_user_idx
  on public.paper_funded_fills(user_id,filled_at desc);
create index if not exists paper_funded_accounts_application_idx
  on public.paper_funded_accounts(application_id) where application_id is not null;

alter table public.paper_funded_orders
  add column if not exists input_mint text,
  add column if not exists output_mint text,
  add column if not exists slippage_bps integer not null default 300 check (slippage_bps between 1 and 500),
  add column if not exists protocol_fee_bps integer not null default 100 check (protocol_fee_bps between 0 and 1000),
  add column if not exists quote_provider text,
  add column if not exists route_labels text[] not null default '{}'::text[],
  add column if not exists price_impact_pct numeric(12,8),
  add column if not exists expected_out_amount_atomic text,
  add column if not exists actual_out_amount_atomic text,
  add column if not exists quote_snapshot jsonb,
  add column if not exists quote_expires_at timestamptz,
  add column if not exists signed_at timestamptz,
  add column if not exists broadcast_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmation_slot bigint,
  add column if not exists network_fee_lamports bigint,
  add column if not exists last_error text;

create unique index if not exists paper_funded_orders_user_idempotency_idx
  on public.paper_funded_orders(user_id,idempotency_key);
create index if not exists paper_funded_orders_account_time_idx
  on public.paper_funded_orders(funded_account_id,created_at desc);

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
  add column if not exists reset_completed_at timestamptz;

create unique index if not exists paper_funded_settlement_account_week_idx
  on public.paper_funded_settlements(funded_account_id,week_start);
create index if not exists paper_funded_settlement_user_idx
  on public.paper_funded_settlements(user_id,created_at desc);
create index if not exists paper_funded_settlement_approved_by_idx
  on public.paper_funded_settlements(approved_by) where approved_by is not null;
create index if not exists paper_funded_settlement_second_approved_by_idx
  on public.paper_funded_settlements(second_approved_by) where second_approved_by is not null;

alter table public.paper_funded_settlements
  add column if not exists payout_network_fee_lamports bigint,
  add column if not exists payout_network_fee_usd numeric(20,8),
  add column if not exists payout_attempts integer not null default 0,
  add column if not exists payout_last_checked_at timestamptz;

-- Signed payout transactions are private server artifacts. Persisting the exact
-- signed bytes before broadcast makes retries idempotent: the same signature can
-- be checked/rebroadcast instead of constructing a second payment.
create schema if not exists paper_private;
revoke all on schema paper_private from public,anon,authenticated;
grant usage on schema paper_private to service_role;

create table if not exists paper_private.payout_broadcast_artifacts (
  settlement_id uuid primary key references public.paper_funded_settlements(id) on delete cascade,
  attempt_no integer not null default 1 check (attempt_no>=1),
  signature text not null unique,
  signed_transaction_base64 text not null,
  blockhash text not null,
  last_valid_block_height bigint not null,
  destination_address text not null,
  payout_asset text not null check (payout_asset in ('USDC','SOL')),
  payout_asset_amount numeric(40,16) not null check (payout_asset_amount>0),
  status text not null default 'signed'
    check (status in ('signed','broadcast','confirmed','failed','expired')),
  broadcast_at timestamptz,
  confirmed_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on paper_private.payout_broadcast_artifacts from public,anon,authenticated;
grant select,insert,update,delete on paper_private.payout_broadcast_artifacts to service_role;

create or replace function public.paper_payout_artifact_get_v1(p_settlement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=paper_private,pg_temp
as $payout_get$
  select to_jsonb(a) from payout_broadcast_artifacts a where a.settlement_id=p_settlement_id;
$payout_get$;
revoke all on function public.paper_payout_artifact_get_v1(uuid) from public,anon,authenticated;
grant execute on function public.paper_payout_artifact_get_v1(uuid) to service_role;

create or replace function public.paper_payout_artifact_upsert_v1(
  p_settlement_id uuid,
  p_attempt_no integer,
  p_signature text,
  p_signed_transaction_base64 text,
  p_blockhash text,
  p_last_valid_block_height bigint,
  p_destination_address text,
  p_payout_asset text,
  p_payout_asset_amount numeric,
  p_status text,
  p_broadcast_at timestamptz,
  p_confirmed_at timestamptz,
  p_last_error text
) returns jsonb
language plpgsql
security definer
set search_path=paper_private,pg_temp
as $payout_upsert$
declare a payout_broadcast_artifacts%rowtype;
begin
  insert into payout_broadcast_artifacts(
    settlement_id,attempt_no,signature,signed_transaction_base64,blockhash,last_valid_block_height,
    destination_address,payout_asset,payout_asset_amount,status,broadcast_at,confirmed_at,
    last_checked_at,last_error,updated_at
  ) values(
    p_settlement_id,p_attempt_no,p_signature,p_signed_transaction_base64,p_blockhash,p_last_valid_block_height,
    p_destination_address,p_payout_asset,p_payout_asset_amount,p_status,p_broadcast_at,p_confirmed_at,
    now(),p_last_error,now()
  )
  on conflict(settlement_id) do update set
    attempt_no=excluded.attempt_no,signature=excluded.signature,
    signed_transaction_base64=excluded.signed_transaction_base64,blockhash=excluded.blockhash,
    last_valid_block_height=excluded.last_valid_block_height,destination_address=excluded.destination_address,
    payout_asset=excluded.payout_asset,payout_asset_amount=excluded.payout_asset_amount,
    status=excluded.status,broadcast_at=excluded.broadcast_at,confirmed_at=excluded.confirmed_at,
    last_checked_at=now(),last_error=excluded.last_error,updated_at=now()
  returning * into a;
  return to_jsonb(a);
end;
$payout_upsert$;
revoke all on function public.paper_payout_artifact_upsert_v1(uuid,integer,text,text,text,bigint,text,text,numeric,text,timestamptz,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.paper_payout_artifact_upsert_v1(uuid,integer,text,text,text,bigint,text,text,numeric,text,timestamptz,timestamptz,text)
  to service_role;

create or replace function public.paper_admin_activate_funded_account(
  target_user uuid,
  trading_wallet text,
  provider_ref text,
  capital numeric default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  pf public.paper_platform_flags%rowtype;
  fp public.paper_funded_profiles%rowtype;
  cw public.paper_custody_wallets%rowtype;
  ts public.paper_treasury_state%rowtype;
  ss public.paper_funded_scale_state%rowtype;
  app public.paper_funded_applications%rowtype;
  acct public.paper_funded_accounts%rowtype;
  v_capital numeric;
  v_new_deployed numeric;
  v_new_reserve numeric;
  v_now timestamptz:=now();
begin
  select * into pf from public.paper_platform_flags where id=true;
  if not (
    pf.legal_review_complete and pf.legal_entity_ready and pf.kyc_provider_configured and
    pf.aml_sanctions_controls_ready and pf.jurisdiction_allowlist_ready and
    pf.turnkey_signing_enabled and pf.custody_security_review_complete and
    pf.treasury_capital_available and pf.real_funded_activation
  ) then raise exception 'REAL_MONEY_GATES_CLOSED'; end if;

  select * into fp from public.paper_funded_profiles where user_id=target_user for update;
  if fp.user_id is null then raise exception 'funded profile missing'; end if;
  if fp.requalify_after is not null and fp.requalify_after>v_now then raise exception 'REQUALIFICATION_COOLDOWN'; end if;
  if fp.kyc_status<>'verified' or fp.aml_status<>'clear' or fp.sanctions_status<>'clear'
     or fp.jurisdiction_status<>'allowed' or not fp.age_verified then
    raise exception 'COMPLIANCE_NOT_READY';
  end if;

  select * into cw from public.paper_custody_wallets where user_id=target_user for update;
  if cw.id is null or cw.status<>'active' or cw.wallet_account_address is null then
    raise exception 'CUSTODY_WALLET_NOT_ACTIVE';
  end if;
  if trading_wallet is distinct from cw.wallet_account_address then raise exception 'CUSTODY_ADDRESS_MISMATCH'; end if;
  if provider_ref is distinct from cw.wallet_id then raise exception 'CUSTODY_PROVIDER_REF_MISMATCH'; end if;

  select * into ss from public.paper_funded_scale_state where user_id=target_user;
  v_capital:=coalesce(ss.capital_usd,1000);
  if capital is not null and abs(capital-v_capital)>0.00000001 then raise exception 'CAPITAL_MUST_MATCH_SCALE_TIER'; end if;

  select * into ts from public.paper_treasury_state where id=true for update;
  if ts.total_capital_usd<=0 then raise exception 'TREASURY_NOT_FUNDED'; end if;
  v_new_deployed:=ts.deployed_capital_usd+v_capital;
  v_new_reserve:=ts.total_capital_usd-v_new_deployed;
  if v_new_deployed>ts.total_capital_usd*(ts.max_deploy_pct/100.0)
     or v_new_reserve<ts.total_capital_usd*(ts.min_reserve_pct/100.0) then
    raise exception 'TREASURY_CAPACITY_UNAVAILABLE';
  end if;

  select * into app from public.paper_funded_applications
    where user_id=target_user and status in ('kyc_required','kyc_pending','approved','active')
    order by applied_at desc limit 1;
  if app.id is null then raise exception 'FUNDED_APPLICATION_MISSING'; end if;

  insert into public.paper_funded_accounts(
    user_id,application_id,status,capital_usd,cash_usd,current_equity_usd,high_water_mark_usd,
    peak_equity_usd,trailing_floor_usd,daily_anchor_date,daily_anchor_equity_usd,
    trading_wallet_address,wallet_provider_ref,max_daily_loss_pct,max_total_drawdown_pct,
    max_position_pct,max_single_trade_pct,max_open_positions,default_slippage_bps,max_slippage_bps,
    protocol_fee_bps,activated_at,updated_at
  ) values(
    target_user,app.id,'active',v_capital,v_capital,v_capital,v_capital,
    v_capital,v_capital*0.85,(v_now at time zone 'utc')::date,v_capital,
    cw.wallet_account_address,cw.wallet_id,5,15,25,25,5,300,500,100,v_now,v_now
  )
  on conflict(user_id) do update set
    application_id=excluded.application_id,status='active',capital_usd=v_capital,cash_usd=v_capital,
    current_equity_usd=v_capital,high_water_mark_usd=v_capital,peak_equity_usd=v_capital,
    trailing_floor_usd=v_capital*0.85,daily_anchor_date=(v_now at time zone 'utc')::date,
    daily_anchor_equity_usd=v_capital,daily_loss_usd=0,current_drawdown_pct=0,
    trading_wallet_address=cw.wallet_account_address,wallet_provider_ref=cw.wallet_id,
    max_daily_loss_pct=5,max_total_drawdown_pct=15,max_position_pct=25,max_single_trade_pct=25,
    max_open_positions=5,default_slippage_bps=300,max_slippage_bps=500,protocol_fee_bps=100,
    breach_reason=null,closed_at=null,activated_at=coalesce(public.paper_funded_accounts.activated_at,v_now),
    updated_at=v_now
  returning * into acct;

  update public.paper_custody_wallets set funded_account_id=acct.id,updated_at=v_now where id=cw.id;
  update public.paper_funded_profiles set stage='active',approved_at=coalesce(approved_at,v_now),
    activated_at=v_now,updated_at=v_now where user_id=target_user;
  update public.paper_funded_applications set status='active',reviewed_at=coalesce(reviewed_at,v_now),updated_at=v_now
    where id=app.id;
  update public.paper_funded_waitlist set status='activated',activated_at=v_now,updated_at=v_now where user_id=target_user;
  update public.paper_treasury_state set deployed_capital_usd=v_new_deployed,reserve_capital_usd=v_new_reserve,updated_at=v_now where id=true;

  return jsonb_build_object(
    'ok',true,'funded_account_id',acct.id,'user_id',target_user,'capital_usd',v_capital,
    'trading_wallet',cw.wallet_account_address,'status','active'
  );
end;
$$;
revoke all on function public.paper_admin_activate_funded_account(uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function public.paper_admin_activate_funded_account(uuid,text,text,numeric) to service_role;

create or replace function public.paper_record_funded_mark_v1(
  p_funded_account_id uuid,
  p_equity_usd numeric,
  p_open_value_usd numeric,
  p_source text,
  p_data_status text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.paper_funded_accounts%rowtype;
  v_now timestamptz:=now();
  v_date date:=(now() at time zone 'utc')::date;
  v_peak numeric;
  v_floor numeric;
  v_anchor numeric;
  v_daily_loss numeric;
  v_drawdown numeric;
  v_limit numeric;
  v_status text;
  v_reason text;
begin
  select * into a from public.paper_funded_accounts where id=p_funded_account_id for update;
  if a.id is null then raise exception 'funded account not found'; end if;
  if p_data_status not in ('LIVE','DEGRADED','STALE','UNAVAILABLE') then raise exception 'invalid data status'; end if;

  if p_data_status<>'LIVE' then
    update public.paper_funded_accounts set data_status=p_data_status,last_mark_at=v_now,updated_at=v_now where id=a.id;
    return jsonb_build_object('status',a.status,'data_status',p_data_status,'trusted_equity_usd',a.current_equity_usd);
  end if;

  if p_equity_usd is null or p_equity_usd<0 or p_open_value_usd is null or p_open_value_usd<0 then
    raise exception 'invalid funded mark';
  end if;

  v_peak:=greatest(coalesce(a.peak_equity_usd,a.capital_usd),p_equity_usd);
  v_floor:=v_peak*(1-a.max_total_drawdown_pct/100.0);
  v_anchor:=case when a.daily_anchor_date=v_date then a.daily_anchor_equity_usd else p_equity_usd end;
  v_daily_loss:=greatest(v_anchor-p_equity_usd,0);
  v_limit:=a.capital_usd*(a.max_daily_loss_pct/100.0);
  v_drawdown:=case when v_peak>0 then greatest((v_peak-p_equity_usd)/v_peak*100,0) else 0 end;
  v_status:=a.status;

  if a.status='active' and p_equity_usd<=v_floor then
    v_status:='closed'; v_reason:='15_percent_trailing_drawdown_breach';
  elsif a.status='active' and v_daily_loss>=v_limit then
    v_status:='closed'; v_reason:='5_percent_daily_loss_breach';
  end if;

  update public.paper_funded_accounts set
    status=v_status,
    current_equity_usd=p_equity_usd,
    peak_equity_usd=v_peak,
    trailing_floor_usd=v_floor,
    daily_anchor_date=v_date,
    daily_anchor_equity_usd=v_anchor,
    daily_loss_usd=v_daily_loss,
    current_drawdown_pct=v_drawdown,
    data_status='LIVE',
    last_mark_at=v_now,
    breach_reason=coalesce(v_reason,breach_reason),
    closed_at=case when v_status='closed' and a.status<>'closed' then v_now else closed_at end,
    updated_at=v_now
  where id=a.id;

  if v_status='closed' and a.status<>'closed' then
    update public.paper_funded_profiles set
      stage='breached',
      requalify_after=v_now+interval '14 days',
      updated_at=v_now
    where user_id=a.user_id;
    insert into public.paper_funded_execution_events(funded_account_id,user_id,event_type,details)
    values(a.id,a.user_id,'risk_breach',jsonb_build_object(
      'reason',v_reason,'equity_usd',p_equity_usd,'peak_equity_usd',v_peak,
      'trailing_floor_usd',v_floor,'daily_loss_usd',v_daily_loss,'daily_limit_usd',v_limit
    ));

    insert into public.paper_funded_liquidation_queue(funded_account_id,user_id,position_id,token_address,reason)
    select a.id,a.user_id,p.id,p.token_address,v_reason
    from public.paper_funded_positions p
    where p.funded_account_id=a.id and p.status='open' and p.quantity_tokens>0
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'funded_account_id',a.id,'status',v_status,'equity_usd',p_equity_usd,
    'peak_equity_usd',v_peak,'trailing_floor_usd',v_floor,'daily_loss_usd',v_daily_loss,
    'daily_loss_limit_usd',v_limit,'current_drawdown_pct',v_drawdown,'breach_reason',v_reason,'data_status','LIVE'
  );
end;
$$;
revoke all on function public.paper_record_funded_mark_v1(uuid,numeric,numeric,text,text) from public,anon,authenticated;
grant execute on function public.paper_record_funded_mark_v1(uuid,numeric,numeric,text,text) to service_role;

create or replace function public.paper_funded_preflight_v1(
  p_user_id uuid,
  p_token_address text,
  p_side text,
  p_notional_usd numeric,
  p_slippage_bps integer
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.paper_funded_accounts%rowtype;
  fp public.paper_funded_profiles%rowtype;
  pf public.paper_platform_flags%rowtype;
  cp public.paper_control_plane%rowtype;
  cw public.paper_custody_wallets%rowtype;
  risk public.paper_token_risk_snapshots%rowtype;
  pos public.paper_funded_positions%rowtype;
  open_count integer;
  projected numeric;
begin
  if p_side not in ('buy','sell') then raise exception 'invalid side'; end if;
  if p_notional_usd<=0 then raise exception 'invalid notional'; end if;

  select * into pf from public.paper_platform_flags where id=true;
  select * into cp from public.paper_control_plane where id=true;
  select * into fp from public.paper_funded_profiles where user_id=p_user_id;
  select * into a from public.paper_funded_accounts where user_id=p_user_id for update;
  select * into cw from public.paper_custody_wallets where user_id=p_user_id;

  if cp.emergency_pause or not cp.paper_trading_enabled then raise exception 'PLATFORM_PAUSED'; end if;
  if not (pf.legal_review_complete and pf.legal_entity_ready and pf.kyc_provider_configured and
          pf.aml_sanctions_controls_ready and pf.jurisdiction_allowlist_ready and
          pf.turnkey_signing_enabled and pf.custody_security_review_complete and
          pf.treasury_capital_available and pf.real_funded_activation) then
    raise exception 'REAL_MONEY_GATES_CLOSED';
  end if;
  if fp.user_id is null or fp.kyc_status<>'verified' or fp.aml_status<>'clear' or
     fp.sanctions_status<>'clear' or fp.jurisdiction_status<>'allowed' or not fp.age_verified then
    raise exception 'COMPLIANCE_NOT_READY';
  end if;
  if a.id is null or a.status<>'active' then raise exception 'FUNDED_ACCOUNT_NOT_ACTIVE'; end if;
  if cw.status<>'active' or cw.wallet_account_address is null then raise exception 'CUSTODY_WALLET_NOT_ACTIVE'; end if;
  if p_slippage_bps<1 or p_slippage_bps>a.max_slippage_bps then raise exception 'SLIPPAGE_LIMIT'; end if;
  if p_side='buy' and p_notional_usd>a.current_equity_usd*(a.max_single_trade_pct/100.0) then raise exception 'SINGLE_TRADE_LIMIT'; end if;

  select * into pos from public.paper_funded_positions
    where funded_account_id=a.id and token_address=p_token_address;

  if p_side='buy' then
    select * into risk from public.paper_token_risk_snapshots where mint_address=p_token_address;
    if risk.mint_address is null or risk.data_status<>'LIVE' or risk.observed_at<now()-interval '90 seconds' then
      raise exception 'FRESH_RISK_SCAN_REQUIRED';
    end if;
    if risk.funded_buy_blocked then raise exception 'TOKEN_RISK_BLOCK'; end if;
    if a.cash_usd<p_notional_usd*(1+a.protocol_fee_bps/10000.0) then raise exception 'INSUFFICIENT_FUNDED_CASH'; end if;

    projected:=coalesce(pos.cost_basis_usd,0)+p_notional_usd;
    if projected>a.current_equity_usd*(a.max_position_pct/100.0) then raise exception 'POSITION_CONCENTRATION_LIMIT'; end if;

    select count(*)::int into open_count from public.paper_funded_positions
      where funded_account_id=a.id and status='open' and quantity_tokens>0;
    if coalesce(pos.quantity_tokens,0)=0 and open_count>=a.max_open_positions then raise exception 'OPEN_POSITION_LIMIT'; end if;
  else
    if pos.id is null or pos.status<>'open' or pos.quantity_tokens<=0 then raise exception 'NO_OPEN_FUNDED_POSITION'; end if;
  end if;

  return jsonb_build_object(
    'ok',true,'funded_account_id',a.id,'wallet_address',cw.wallet_account_address,
    'capital_usd',a.capital_usd,'cash_usd',a.cash_usd,'equity_usd',a.current_equity_usd,
    'protocol_fee_bps',a.protocol_fee_bps,'default_slippage_bps',a.default_slippage_bps,
    'max_slippage_bps',a.max_slippage_bps,'side',p_side,'token_address',p_token_address,
    'requested_notional_usd',p_notional_usd
  );
end;
$$;
revoke all on function public.paper_funded_preflight_v1(uuid,text,text,numeric,integer) from public,anon,authenticated;
grant execute on function public.paper_funded_preflight_v1(uuid,text,text,numeric,integer) to service_role;

create or replace function public.paper_record_funded_fill_v1(
  p_order_id uuid,
  p_quantity_tokens numeric,
  p_fill_price_usd numeric,
  p_notional_usd numeric,
  p_network_fee_usd numeric,
  p_tx_signature text,
  p_confirmation_slot bigint
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  o public.paper_funded_orders%rowtype;
  a public.paper_funded_accounts%rowtype;
  p public.paper_funded_positions%rowtype;
  v_fee numeric;
  v_cash numeric;
  v_new_qty numeric;
  v_new_cost numeric;
  v_avg numeric;
  v_realized numeric:=0;
  v_cost_released numeric:=0;
begin
  select * into o from public.paper_funded_orders where id=p_order_id for update;
  if o.id is null then raise exception 'order not found'; end if;
  if o.status='confirmed' then
    return jsonb_build_object('ok',true,'idempotent',true,'order_id',o.id,'tx_signature',o.tx_signature);
  end if;
  if o.status not in ('pending','quoted','signed','broadcast') then raise exception 'order not fillable'; end if;
  select * into a from public.paper_funded_accounts where id=o.funded_account_id for update;
  if a.id is null then raise exception 'funded account missing'; end if;

  v_fee:=round(p_notional_usd*(o.protocol_fee_bps/10000.0),8);
  select * into p from public.paper_funded_positions
    where funded_account_id=a.id and token_address=o.token_address for update;

  if o.side='buy' then
    -- PAPER pays network fees; funded trader equity is charged only notional + protocol fee.
    v_cash:=a.cash_usd-p_notional_usd-v_fee;
    if v_cash<0 then raise exception 'confirmed fill exceeds funded cash'; end if;
    v_new_qty:=coalesce(p.quantity_tokens,0)+p_quantity_tokens;
    v_new_cost:=coalesce(p.cost_basis_usd,0)+p_notional_usd+v_fee;
    v_avg:=case when v_new_qty>0 then v_new_cost/v_new_qty else 0 end;

    insert into public.paper_funded_positions(
      funded_account_id,user_id,token_address,quantity_tokens,cost_basis_usd,average_entry_price_usd,status,opened_at,updated_at
    ) values(a.id,o.user_id,o.token_address,p_quantity_tokens,p_notional_usd+v_fee,v_avg,'open',now(),now())
    on conflict(funded_account_id,token_address) do update set
      quantity_tokens=v_new_qty,cost_basis_usd=v_new_cost,average_entry_price_usd=v_avg,status='open',
      closed_at=null,updated_at=now();
  else
    if p.id is null or p.quantity_tokens<=0 then raise exception 'no funded position'; end if;
    if p_quantity_tokens>p.quantity_tokens*(1+0.00000001) then raise exception 'sell exceeds funded position'; end if;
    v_cost_released:=case when p.quantity_tokens>0 then p.cost_basis_usd*(p_quantity_tokens/p.quantity_tokens) else 0 end;
    v_realized:=p_notional_usd-v_fee-v_cost_released;
    -- PAPER pays network fees; funded trader equity is charged only the protocol fee.
    v_cash:=a.cash_usd+p_notional_usd-v_fee;
    v_new_qty:=greatest(p.quantity_tokens-p_quantity_tokens,0);
    v_new_cost:=greatest(p.cost_basis_usd-v_cost_released,0);

    update public.paper_funded_positions set
      quantity_tokens=v_new_qty,cost_basis_usd=v_new_cost,
      realized_pnl_usd=realized_pnl_usd+v_realized,
      status=case when v_new_qty<=0.000000000001 then 'closed' else 'open' end,
      closed_at=case when v_new_qty<=0.000000000001 then now() else null end,
      updated_at=now()
    where id=p.id;
  end if;

  update public.paper_funded_accounts set cash_usd=v_cash,updated_at=now() where id=a.id;
  update public.paper_funded_orders set
    status='confirmed',tx_signature=p_tx_signature,confirmed_at=now(),confirmation_slot=p_confirmation_slot,
    updated_at=now()
  where id=o.id;

  insert into public.paper_funded_fills(
    order_id,funded_account_id,user_id,token_address,side,quantity_tokens,fill_price_usd,
    notional_usd,protocol_fee_usd,network_fee_usd,tx_signature,filled_at
  ) values(o.id,a.id,o.user_id,o.token_address,o.side,p_quantity_tokens,p_fill_price_usd,
           p_notional_usd,v_fee,coalesce(p_network_fee_usd,0),p_tx_signature,now());

  insert into public.paper_funded_execution_events(order_id,funded_account_id,user_id,event_type,provider,tx_signature,confirmation_slot,details)
  values(o.id,a.id,o.user_id,'confirmed_fill','jupiter',p_tx_signature,p_confirmation_slot,
         jsonb_build_object('side',o.side,'notional_usd',p_notional_usd,'protocol_fee_usd',v_fee,'network_fee_usd',coalesce(p_network_fee_usd,0)));

  insert into public.paper_funded_fee_ledger(order_id,funded_account_id,user_id,protocol_fee_usd,network_fee_usd)
  values(o.id,a.id,o.user_id,v_fee,coalesce(p_network_fee_usd,0))
  on conflict(order_id) do nothing;

  update public.paper_treasury_state set
    cumulative_protocol_revenue_usd=cumulative_protocol_revenue_usd+v_fee,
    cumulative_network_fees_usd=cumulative_network_fees_usd+coalesce(p_network_fee_usd,0),
    updated_at=now()
  where id=true;

  return jsonb_build_object('ok',true,'order_id',o.id,'cash_usd',v_cash,'protocol_fee_usd',v_fee,'realized_pnl_usd',v_realized);
end;
$$;
revoke all on function public.paper_record_funded_fill_v1(uuid,numeric,numeric,numeric,numeric,text,bigint) from public,anon,authenticated;
grant execute on function public.paper_record_funded_fill_v1(uuid,numeric,numeric,numeric,numeric,text,bigint) to service_role;

create or replace function public.paper_generate_funded_settlements_v1()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  created_count integer:=0;
begin
  if not coalesce((
    select legal_review_complete and legal_entity_ready and kyc_provider_configured and
           aml_sanctions_controls_ready and jurisdiction_allowlist_ready and
           turnkey_signing_enabled and custody_security_review_complete and
           treasury_capital_available and real_funded_activation and real_payouts_enabled
    from public.paper_platform_flags where id=true
  ),false) then
    return 0;
  end if;

  insert into public.paper_funded_settlements(
    funded_account_id,user_id,week_start,week_end,opening_high_water_mark_usd,closing_equity_usd,
    eligible_profit_usd,trader_share_usd,paper_share_usd,status,payout_wallet_snapshot,payout_asset,created_at
  )
  select
    a.id,a.user_id,(date_trunc('week',now() at time zone 'utc'))::date,
    ((date_trunc('week',now() at time zone 'utc'))::date+6),
    a.high_water_mark_usd,a.cash_usd,
    greatest(a.cash_usd-a.high_water_mark_usd,0),
    greatest(a.cash_usd-a.high_water_mark_usd,0)*(a.trader_split_bps/10000.0),
    greatest(a.cash_usd-a.high_water_mark_usd,0)*(a.paper_split_bps/10000.0),
    case when greatest(a.cash_usd-a.high_water_mark_usd,0)*(a.trader_split_bps/10000.0)>=25 then 'generated' else 'below_minimum' end,
    fp.payout_wallet_address,fp.preferred_payout_asset,now()
  from public.paper_funded_accounts a
  join public.paper_funded_profiles fp on fp.user_id=a.user_id
  where a.status='active'
    and fp.kyc_status='verified' and fp.aml_status='clear' and fp.sanctions_status='clear'
    and fp.jurisdiction_status='allowed' and fp.payout_wallet_verified_at is not null
    and not exists(
      select 1 from public.paper_funded_positions p
      where p.funded_account_id=a.id and p.status='open' and p.quantity_tokens>0
    )
  on conflict(funded_account_id,week_start) do nothing;

  get diagnostics created_count=row_count;
  return created_count;
end;
$$;
revoke all on function public.paper_generate_funded_settlements_v1() from public,anon,authenticated;
grant execute on function public.paper_generate_funded_settlements_v1() to service_role;

create or replace function public.paper_finalize_funded_payout_v1(
  p_settlement_id uuid,
  p_tx_signature text,
  p_confirmation_slot bigint,
  p_asset_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  s public.paper_funded_settlements%rowtype;
  a public.paper_funded_accounts%rowtype;
  fp public.paper_funded_profiles%rowtype;
  sec public.account_security%rowtype;
  scale jsonb;
  next_capital numeric;
begin
  select * into s from public.paper_funded_settlements where id=p_settlement_id for update;
  if s.id is null then raise exception 'settlement not found'; end if;
  if s.status='paid' then return jsonb_build_object('ok',true,'idempotent',true,'tx_signature',s.payout_tx_signature); end if;
  if s.status<>'approved' then raise exception 'settlement not approved'; end if;
  if s.approved_by is null or s.approved_at is null then raise exception 'ADMIN_APPROVAL_REQUIRED'; end if;
  if s.trader_share_usd>2000 and (
    s.second_approved_by is null or s.second_approved_at is null or s.second_approved_by=s.approved_by
  ) then raise exception 'SECOND_ADMIN_APPROVAL_REQUIRED'; end if;
  if s.payout_tx_signature is null or s.payout_tx_signature is distinct from p_tx_signature then
    raise exception 'PAYOUT_SIGNATURE_MISMATCH';
  end if;
  if s.payout_broadcast_at is null then raise exception 'PAYOUT_NOT_BROADCAST'; end if;
  if not coalesce((
    select legal_review_complete and legal_entity_ready and kyc_provider_configured and
           aml_sanctions_controls_ready and jurisdiction_allowlist_ready and
           turnkey_signing_enabled and custody_security_review_complete and
           treasury_capital_available and real_funded_activation and real_payouts_enabled
    from public.paper_platform_flags where id=true
  ),false) then
    raise exception 'REAL_PAYOUTS_DISABLED';
  end if;

  select * into fp from public.paper_funded_profiles where user_id=s.user_id;
  if fp.user_id is null or fp.kyc_status<>'verified' or fp.aml_status<>'clear' or
     fp.sanctions_status<>'clear' or fp.jurisdiction_status<>'allowed' or not fp.age_verified then
    raise exception 'COMPLIANCE_NOT_READY';
  end if;
  if fp.tax_status in ('required','collecting','review') then raise exception 'TAX_READINESS_REQUIRED'; end if;
  if fp.payout_wallet_verified_at is null or fp.payout_wallet_address is distinct from s.payout_wallet_snapshot then
    raise exception 'VERIFIED_PAYOUT_WALLET_REQUIRED';
  end if;

  select * into sec from public.account_security where user_id=s.user_id;
  if sec.user_id is null or sec.payout_wallet_address is distinct from s.payout_wallet_snapshot or sec.flagged_for_review then
    raise exception 'PAYOUT_ACCOUNT_REVIEW_REQUIRED';
  end if;

  select * into a from public.paper_funded_accounts where id=s.funded_account_id for update;
  if a.id is null or a.status<>'active' or a.breach_reason is not null then
    raise exception 'FUNDED_ACCOUNT_NOT_PAYABLE';
  end if;
  if exists(
    select 1 from public.paper_funded_positions p
    where p.funded_account_id=a.id and p.status='open' and p.quantity_tokens>0
  ) then raise exception 'POSITIONS_MUST_BE_FLAT'; end if;

  scale:=public.paper_apply_scale_cycle_v1(s.user_id,true);
  next_capital:=coalesce((scale->>'capital_usd')::numeric,a.capital_usd);

  update public.paper_funded_settlements set
    status='paid',payout_tx_signature=p_tx_signature,payout_asset_amount=p_asset_amount,
    payout_broadcast_at=coalesce(payout_broadcast_at,now()),payout_confirmation_slot=p_confirmation_slot,
    paid_at=now(),reset_capital_usd=next_capital,reset_completed_at=now()
  where id=s.id;

  update public.paper_funded_accounts set
    capital_usd=next_capital,cash_usd=next_capital,current_equity_usd=next_capital,
    high_water_mark_usd=next_capital,peak_equity_usd=next_capital,trailing_floor_usd=next_capital*(1-max_total_drawdown_pct/100.0),
    daily_anchor_date=(now() at time zone 'utc')::date,daily_anchor_equity_usd=next_capital,
    daily_loss_usd=0,current_drawdown_pct=0,data_status='UNAVAILABLE',last_mark_at=null,updated_at=now()
  where id=a.id;

  return jsonb_build_object('ok',true,'settlement_id',s.id,'tx_signature',p_tx_signature,'next_capital_usd',next_capital,'scale',scale);
end;
$$;
revoke all on function public.paper_finalize_funded_payout_v1(uuid,text,bigint,numeric) from public,anon,authenticated;
grant execute on function public.paper_finalize_funded_payout_v1(uuid,text,bigint,numeric) to service_role;

create or replace function paper_private.invoke_funded_monitor()
returns bigint
language plpgsql
security definer
set search_path=paper_private,public,net,pg_temp
as $$
declare
  cfg paper_private.runtime_config%rowtype;
  tok text;
  req_id bigint;
begin
  select * into cfg from paper_private.runtime_config where id=true;
  if not coalesce(cfg.monitor_enabled,false) or cfg.project_url is null then return null; end if;
  select internal_monitor_token into tok from paper_private.runtime_secrets where id=true;

  select net.http_post(
    url:=rtrim(cfg.project_url,'/')||'/functions/v1/funded-monitor',
    headers:=jsonb_build_object('Content-Type','application/json','x-paper-internal-token',tok),
    body:='{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds:=20000
  ) into req_id;
  return req_id;
end;
$$;
revoke all on function paper_private.invoke_funded_monitor() from public,anon,authenticated;
grant execute on function paper_private.invoke_funded_monitor() to service_role;

do $$
declare existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname='paper-funded-monitor-v1';
  if existing_id is not null then perform cron.unschedule(existing_id); end if;
  perform cron.schedule('paper-funded-monitor-v1','30 seconds','select paper_private.invoke_funded_monitor();');
end $$;

do $$
declare existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname='paper-funded-settlement-v1';
  if existing_id is not null then perform cron.unschedule(existing_id); end if;
  perform cron.schedule('paper-funded-settlement-v1','0 17 * * 5','select public.paper_generate_funded_settlements_v1();');
end $$;
