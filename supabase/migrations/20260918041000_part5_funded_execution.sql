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
alter table public.paper_funded_execution_events enable row level security;
revoke all on public.paper_funded_execution_events from public,anon,authenticated;
create index if not exists paper_funded_execution_order_idx
  on public.paper_funded_execution_events(order_id,created_at desc);
create index if not exists paper_funded_execution_user_idx
  on public.paper_funded_execution_events(user_id,created_at desc);

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
  if p_notional_usd>a.current_equity_usd*(a.max_single_trade_pct/100.0) then raise exception 'SINGLE_TRADE_LIMIT'; end if;

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
    v_cash:=a.cash_usd-p_notional_usd-v_fee-coalesce(p_network_fee_usd,0);
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
    v_cash:=a.cash_usd+p_notional_usd-v_fee-coalesce(p_network_fee_usd,0);
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
    network_fee_lamports=network_fee_lamports,updated_at=now()
  where id=o.id;

  insert into public.paper_funded_fills(
    order_id,funded_account_id,user_id,token_address,side,quantity_tokens,fill_price_usd,
    notional_usd,protocol_fee_usd,network_fee_usd,tx_signature,filled_at
  ) values(o.id,a.id,o.user_id,o.token_address,o.side,p_quantity_tokens,p_fill_price_usd,
           p_notional_usd,v_fee,coalesce(p_network_fee_usd,0),p_tx_signature,now());

  insert into public.paper_funded_execution_events(order_id,funded_account_id,user_id,event_type,provider,tx_signature,confirmation_slot,details)
  values(o.id,a.id,o.user_id,'confirmed_fill','jupiter',p_tx_signature,p_confirmation_slot,
         jsonb_build_object('side',o.side,'notional_usd',p_notional_usd,'protocol_fee_usd',v_fee,'network_fee_usd',coalesce(p_network_fee_usd,0)));

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
  if not coalesce((select real_payouts_enabled from public.paper_platform_flags where id=true),false) then
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
  scale jsonb;
  next_capital numeric;
begin
  select * into s from public.paper_funded_settlements where id=p_settlement_id for update;
  if s.id is null then raise exception 'settlement not found'; end if;
  if s.status='paid' then return jsonb_build_object('ok',true,'idempotent',true,'tx_signature',s.payout_tx_signature); end if;
  if s.status<>'approved' then raise exception 'settlement not approved'; end if;
  if not coalesce((select real_payouts_enabled from public.paper_platform_flags where id=true),false) then
    raise exception 'REAL_PAYOUTS_DISABLED';
  end if;

  select * into a from public.paper_funded_accounts where id=s.funded_account_id for update;
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

do $$
declare existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname='paper-funded-settlement-v1';
  if existing_id is not null then perform cron.unschedule(existing_id); end if;
  perform cron.schedule('paper-funded-settlement-v1','0 17 * * 5','select public.paper_generate_funded_settlements_v1();');
end $$;
