-- Keep activation function defaults aligned with legacy production signature.
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
