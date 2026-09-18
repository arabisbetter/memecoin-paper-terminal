-- Compatibility shim for production projects created before funded execution
-- metadata columns were introduced.
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
