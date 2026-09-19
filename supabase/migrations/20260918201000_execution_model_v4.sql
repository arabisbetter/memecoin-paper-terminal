-- Deterministic constant-product PAPER execution accounting v4.

create or replace function public.execute_paper_buy_v3(
  p_user_id uuid,p_idempotency_key text,p_request_fingerprint text,p_mint text,p_ticker text,p_name text,p_image_url text,
  p_pair_address text,p_dex_id text,p_amount_sol numeric,p_notional_usd numeric,p_displayed_price_usd numeric,p_fill_price_usd numeric,
  p_displayed_mc_usd numeric,p_fill_mc_usd numeric,p_liquidity_usd numeric,p_price_impact_pct numeric,p_effective_slippage_bps numeric,
  p_paper_fee_usd numeric,p_dex_fee_usd numeric,p_network_fee_usd numeric,p_priority_fee_sol numeric,p_post_trade_price_usd numeric,
  p_slippage_limit_bps numeric,p_sol_price_usd numeric,p_quote_timestamp timestamptz,p_market_data_age_ms integer,
  p_execution_quality text default 'modeled',p_execution_model_version text default 'v4_constant_product_slippage'
) returns jsonb language plpgsql set search_path to 'public' as $$
declare
  v_existing public.paper_orders%rowtype; v_order_id uuid; v_fill_id uuid; v_trade_id uuid; v_token_id uuid; v_position_id uuid;
  v_cash numeric; v_debit numeric; v_quantity numeric; v_old_qty numeric; v_old_cost_usd numeric; v_new_qty numeric; v_new_cost_usd numeric; v_avg_price numeric;
begin
  if p_idempotency_key is null or length(p_idempotency_key)<8 then raise exception 'idempotency key required'; end if;
  if p_notional_usd<=0 or p_fill_price_usd<=0 or p_displayed_price_usd<=0 then raise exception 'invalid trade inputs'; end if;
  if p_market_data_age_ms<0 or p_market_data_age_ms>10000 then raise exception 'market data is stale'; end if;
  if p_effective_slippage_bps>p_slippage_limit_bps then raise exception 'slippage limit exceeded'; end if;
  select * into v_existing from public.paper_orders where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if v_existing.id is not null then
    if v_existing.request_fingerprint<>p_request_fingerprint then raise exception 'idempotency key payload conflict'; end if;
    if v_existing.status='filled' then return jsonb_build_object('replayed',true,'order_id',v_existing.id,'fill',(select to_jsonb(f) from public.paper_fills f where f.order_id=v_existing.id),'account',(select to_jsonb(a) from public.paper_accounts a where a.user_id=p_user_id)); end if;
    raise exception 'order already processing';
  end if;
  insert into public.paper_orders(user_id,client_order_id,idempotency_key,request_fingerprint,token_chain,token_address,pool_address,side,order_type,requested_notional_usd,requested_native_amount,status)
  values(p_user_id,p_idempotency_key,p_idempotency_key,p_request_fingerprint,'solana',p_mint,p_pair_address,'buy','market',p_notional_usd,p_amount_sol,'processing') returning id into v_order_id;
  select cash_usd into v_cash from public.paper_accounts where user_id=p_user_id and status='active' for update;
  if v_cash is null then raise exception 'PAPER account not found'; end if;
  v_debit:=p_notional_usd+p_paper_fee_usd+p_network_fee_usd;
  if v_cash<v_debit then raise exception 'insufficient PAPER buying power'; end if;
  insert into public.tokens(mint_address,ticker,name,image_url,pair_address,dex_id,updated_at)
  values(p_mint,p_ticker,p_name,p_image_url,p_pair_address,p_dex_id,now())
  on conflict(mint_address) do update set ticker=coalesce(excluded.ticker,public.tokens.ticker),name=coalesce(excluded.name,public.tokens.name),
    image_url=coalesce(excluded.image_url,public.tokens.image_url),pair_address=coalesce(excluded.pair_address,public.tokens.pair_address),
    dex_id=coalesce(excluded.dex_id,public.tokens.dex_id),updated_at=now() returning id into v_token_id;
  v_quantity:=p_notional_usd/p_fill_price_usd;
  select id,quantity_tokens,coalesce(cost_basis_usd,0) into v_position_id,v_old_qty,v_old_cost_usd
  from public.paper_positions where user_id=p_user_id and token_id=v_token_id and status='open' for update;
  if v_position_id is null then
    insert into public.paper_positions(user_id,token_id,quantity_tokens,cost_basis_sol,cost_basis_usd,average_entry_price_usd,average_entry_mc_usd,realized_pnl_usd,accounting_version)
    values(p_user_id,v_token_id,v_quantity,coalesce(p_amount_sol,0),p_notional_usd+p_paper_fee_usd+p_network_fee_usd,p_fill_price_usd,p_fill_mc_usd,0,'usd_v2') returning id into v_position_id;
  else
    if coalesce((select accounting_version from public.paper_positions where id=v_position_id),'')<>'usd_v2' then raise exception 'legacy PAPER position cannot be merged into USD mode'; end if;
    v_new_qty:=v_old_qty+v_quantity; v_new_cost_usd:=v_old_cost_usd+p_notional_usd+p_paper_fee_usd+p_network_fee_usd;
    v_avg_price:=((v_old_qty*(select average_entry_price_usd from public.paper_positions where id=v_position_id))+(v_quantity*p_fill_price_usd))/nullif(v_new_qty,0);
    update public.paper_positions set quantity_tokens=v_new_qty,cost_basis_usd=v_new_cost_usd,cost_basis_sol=coalesce(cost_basis_sol,0)+coalesce(p_amount_sol,0),
      average_entry_price_usd=v_avg_price,average_entry_mc_usd=case when p_displayed_price_usd>0 then v_avg_price/p_displayed_price_usd*p_displayed_mc_usd else average_entry_mc_usd end,
      accounting_version='usd_v2',updated_at=now() where id=v_position_id;
  end if;
  update public.paper_accounts set cash_usd=cash_usd-v_debit,updated_at=now() where user_id=p_user_id returning cash_usd into v_cash;
  insert into public.paper_fills(order_id,user_id,token_chain,token_address,pool_address,side,order_type,requested_amount_usd,requested_amount_native,quantity_tokens,
    reference_price_usd,simulated_fill_price_usd,price_impact_bps,slippage_bps,paper_fee_usd,dex_fee_usd,network_fee_usd,priority_fee_sol,post_trade_price_usd,slippage_limit_bps,
    liquidity_usd,quote_timestamp,market_data_age_ms,execution_model_version,quality)
  values(v_order_id,p_user_id,'solana',p_mint,p_pair_address,'buy','market',p_notional_usd,p_amount_sol,v_quantity,p_displayed_price_usd,p_fill_price_usd,
    p_price_impact_pct*100,p_effective_slippage_bps,p_paper_fee_usd,p_dex_fee_usd,p_network_fee_usd,p_priority_fee_sol,p_post_trade_price_usd,p_slippage_limit_bps,
    p_liquidity_usd,p_quote_timestamp,p_market_data_age_ms,p_execution_model_version,p_execution_quality) returning id into v_fill_id;
  insert into public.paper_trades(position_id,user_id,token_id,action,amount_sol,quantity_tokens,displayed_price_usd,simulated_fill_price_usd,displayed_mc_usd,simulated_fill_mc_usd,
    liquidity_usd,price_impact_pct,fee_sol,is_paper,notional_usd,fee_usd,dex_fee_usd,network_fee_usd,priority_fee_sol,post_trade_price_usd,slippage_limit_bps,
    quote_timestamp,market_data_age_ms,execution_model_version,execution_quality,order_id,fill_id,accounting_version)
  values(v_position_id,p_user_id,v_token_id,'buy',coalesce(p_amount_sol,0),v_quantity,p_displayed_price_usd,p_fill_price_usd,p_displayed_mc_usd,p_fill_mc_usd,
    p_liquidity_usd,p_price_impact_pct,case when p_sol_price_usd>0 then (p_paper_fee_usd+p_network_fee_usd)/p_sol_price_usd else 0 end,true,p_notional_usd,p_paper_fee_usd,
    p_dex_fee_usd,p_network_fee_usd,p_priority_fee_sol,p_post_trade_price_usd,p_slippage_limit_bps,p_quote_timestamp,p_market_data_age_ms,p_execution_model_version,p_execution_quality,
    v_order_id,v_fill_id,'usd_v2') returning id into v_trade_id;
  update public.paper_orders set status='filled',executed_at=now(),updated_at=now() where id=v_order_id;
  insert into public.paper_ledger_entries(user_id,account_id,entry_type,amount_usd,balance_after_usd,related_trade_id,related_order_id,metadata_json,idempotency_key)
  values(p_user_id,p_user_id,'paper_buy',-v_debit,v_cash,v_trade_id,v_order_id,
    jsonb_build_object('notional_usd',p_notional_usd,'paper_fee_usd',p_paper_fee_usd,'network_fee_usd',p_network_fee_usd,'dex_fee_usd',p_dex_fee_usd,'token',p_mint),
    p_idempotency_key||':ledger');
  return jsonb_build_object('replayed',false,'order_id',v_order_id,'fill_id',v_fill_id,'trade_id',v_trade_id,'position_id',v_position_id,'quantity_tokens',v_quantity,'paper_cash_usd',v_cash);
end $$;

create or replace function public.execute_paper_sell_v3(
  p_user_id uuid,p_idempotency_key text,p_request_fingerprint text,p_mint text,p_sell_pct numeric,p_displayed_price_usd numeric,p_fill_price_usd numeric,
  p_displayed_mc_usd numeric,p_fill_mc_usd numeric,p_liquidity_usd numeric,p_price_impact_pct numeric,p_effective_slippage_bps numeric,
  p_paper_fee_usd numeric,p_dex_fee_usd numeric,p_network_fee_usd numeric,p_priority_fee_sol numeric,p_post_trade_price_usd numeric,p_slippage_limit_bps numeric,
  p_sol_price_usd numeric,p_quote_timestamp timestamptz,p_market_data_age_ms integer,p_execution_quality text default 'modeled',
  p_execution_model_version text default 'v4_constant_product_slippage'
) returns jsonb language plpgsql set search_path to 'public' as $$
declare
  v_existing public.paper_orders%rowtype; v_order_id uuid; v_fill_id uuid; v_trade_id uuid; v_token_id uuid; v_position public.paper_positions%rowtype;
  v_sell_qty numeric; v_gross_usd numeric; v_net_usd numeric; v_cost_sold_usd numeric; v_realized_usd numeric; v_remaining_qty numeric; v_remaining_cost_usd numeric; v_cash numeric; v_amount_sol numeric;
begin
  if p_idempotency_key is null or length(p_idempotency_key)<8 then raise exception 'idempotency key required'; end if;
  if p_sell_pct<=0 or p_sell_pct>100 or p_fill_price_usd<=0 or p_displayed_price_usd<=0 then raise exception 'invalid sell inputs'; end if;
  if p_market_data_age_ms<0 or p_market_data_age_ms>10000 then raise exception 'market data is stale'; end if;
  if p_effective_slippage_bps>p_slippage_limit_bps then raise exception 'slippage limit exceeded'; end if;
  select * into v_existing from public.paper_orders where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if v_existing.id is not null then
    if v_existing.request_fingerprint<>p_request_fingerprint then raise exception 'idempotency key payload conflict'; end if;
    if v_existing.status='filled' then return jsonb_build_object('replayed',true,'order_id',v_existing.id,'fill',(select to_jsonb(f) from public.paper_fills f where f.order_id=v_existing.id),'account',(select to_jsonb(a) from public.paper_accounts a where a.user_id=p_user_id)); end if;
    raise exception 'order already processing';
  end if;
  select id into v_token_id from public.tokens where mint_address=p_mint; if v_token_id is null then raise exception 'token not found'; end if;
  select * into v_position from public.paper_positions where user_id=p_user_id and token_id=v_token_id and status='open' for update;
  if v_position.id is null or v_position.quantity_tokens<=0 then raise exception 'no open PAPER position'; end if;
  if coalesce(v_position.accounting_version,'')<>'usd_v2' then raise exception 'legacy PAPER position cannot be sold in USD mode'; end if;
  v_sell_qty:=v_position.quantity_tokens*(p_sell_pct/100.0); v_gross_usd:=v_sell_qty*p_fill_price_usd;
  v_net_usd:=greatest(v_gross_usd-p_paper_fee_usd-p_network_fee_usd,0);
  v_cost_sold_usd:=coalesce(v_position.cost_basis_usd,0)*(p_sell_pct/100.0); v_realized_usd:=v_net_usd-v_cost_sold_usd;
  v_remaining_qty:=v_position.quantity_tokens-v_sell_qty; v_remaining_cost_usd:=coalesce(v_position.cost_basis_usd,0)-v_cost_sold_usd;
  v_amount_sol:=case when p_sol_price_usd>0 then v_gross_usd/p_sol_price_usd else 0 end;
  insert into public.paper_orders(user_id,client_order_id,idempotency_key,request_fingerprint,token_chain,token_address,pool_address,side,order_type,requested_notional_usd,requested_native_amount,sell_pct,status)
  values(p_user_id,p_idempotency_key,p_idempotency_key,p_request_fingerprint,'solana',p_mint,null,'sell','market',v_gross_usd,v_amount_sol,p_sell_pct,'processing') returning id into v_order_id;
  select cash_usd into v_cash from public.paper_accounts where user_id=p_user_id and status='active' for update; if v_cash is null then raise exception 'PAPER account not found'; end if;
  update public.paper_accounts set cash_usd=cash_usd+v_net_usd,updated_at=now() where user_id=p_user_id returning cash_usd into v_cash;
  update public.paper_positions set quantity_tokens=case when p_sell_pct>=99.999999 then 0 else v_remaining_qty end,
    cost_basis_usd=case when p_sell_pct>=99.999999 then 0 else v_remaining_cost_usd end,
    cost_basis_sol=case when p_sell_pct>=99.999999 then 0 else coalesce(cost_basis_sol,0)*(1-p_sell_pct/100.0) end,
    realized_pnl_usd=coalesce(realized_pnl_usd,0)+v_realized_usd,status=case when p_sell_pct>=99.999999 then 'closed' else 'open' end,
    closed_at=case when p_sell_pct>=99.999999 then now() else null end,updated_at=now() where id=v_position.id;
  insert into public.paper_fills(order_id,user_id,token_chain,token_address,pool_address,side,order_type,requested_amount_usd,requested_amount_native,quantity_tokens,
    reference_price_usd,simulated_fill_price_usd,price_impact_bps,slippage_bps,paper_fee_usd,dex_fee_usd,network_fee_usd,priority_fee_sol,post_trade_price_usd,slippage_limit_bps,
    liquidity_usd,quote_timestamp,market_data_age_ms,execution_model_version,quality)
  values(v_order_id,p_user_id,'solana',p_mint,null,'sell','market',v_gross_usd,v_amount_sol,v_sell_qty,p_displayed_price_usd,p_fill_price_usd,p_price_impact_pct*100,
    p_effective_slippage_bps,p_paper_fee_usd,p_dex_fee_usd,p_network_fee_usd,p_priority_fee_sol,p_post_trade_price_usd,p_slippage_limit_bps,p_liquidity_usd,
    p_quote_timestamp,p_market_data_age_ms,p_execution_model_version,p_execution_quality) returning id into v_fill_id;
  insert into public.paper_trades(position_id,user_id,token_id,action,amount_sol,quantity_tokens,displayed_price_usd,simulated_fill_price_usd,displayed_mc_usd,simulated_fill_mc_usd,
    liquidity_usd,price_impact_pct,fee_sol,is_paper,notional_usd,fee_usd,dex_fee_usd,network_fee_usd,priority_fee_sol,post_trade_price_usd,slippage_limit_bps,
    quote_timestamp,market_data_age_ms,execution_model_version,execution_quality,order_id,fill_id,accounting_version)
  values(v_position.id,p_user_id,v_token_id,'sell',v_amount_sol,v_sell_qty,p_displayed_price_usd,p_fill_price_usd,p_displayed_mc_usd,p_fill_mc_usd,p_liquidity_usd,
    p_price_impact_pct,case when p_sol_price_usd>0 then (p_paper_fee_usd+p_network_fee_usd)/p_sol_price_usd else 0 end,true,v_gross_usd,p_paper_fee_usd,p_dex_fee_usd,
    p_network_fee_usd,p_priority_fee_sol,p_post_trade_price_usd,p_slippage_limit_bps,p_quote_timestamp,p_market_data_age_ms,p_execution_model_version,p_execution_quality,
    v_order_id,v_fill_id,'usd_v2') returning id into v_trade_id;
  update public.paper_orders set status='filled',executed_at=now(),updated_at=now() where id=v_order_id;
  insert into public.paper_ledger_entries(user_id,account_id,entry_type,amount_usd,balance_after_usd,related_trade_id,related_order_id,metadata_json,idempotency_key)
  values(p_user_id,p_user_id,'paper_sell',v_net_usd,v_cash,v_trade_id,v_order_id,
    jsonb_build_object('gross_usd',v_gross_usd,'paper_fee_usd',p_paper_fee_usd,'network_fee_usd',p_network_fee_usd,'dex_fee_usd',p_dex_fee_usd,'realized_pnl_usd',v_realized_usd,'token',p_mint),
    p_idempotency_key||':ledger');
  return jsonb_build_object('replayed',false,'order_id',v_order_id,'fill_id',v_fill_id,'trade_id',v_trade_id,'position_id',v_position.id,'sold_quantity',v_sell_qty,
    'gross_usd',v_gross_usd,'net_usd',v_net_usd,'realized_pnl_usd',v_realized_usd,'paper_cash_usd',v_cash,'position_status',case when p_sell_pct>=99.999999 then 'closed' else 'open' end);
end $$;

revoke all on function public.execute_paper_buy_v3(uuid,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,integer,text,text) from public,anon,authenticated;
grant execute on function public.execute_paper_buy_v3(uuid,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,integer,text,text) to service_role;
revoke all on function public.execute_paper_sell_v3(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,integer,text,text) from public,anon,authenticated;
grant execute on function public.execute_paper_sell_v3(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,integer,text,text) to service_role;
