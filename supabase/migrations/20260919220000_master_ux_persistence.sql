-- PAPER master UX persistence: quick-buy presets, token search history,
-- in-app feedback, and owner-scoped client error telemetry.
-- Anonymous Supabase users carry the authenticated role, so auth.uid()
-- remains the ownership boundary.

create table if not exists public.paper_trade_presets(
  user_id uuid primary key references auth.users(id) on delete cascade,
  p1 numeric not null default 0.1 check (p1 > 0 and p1 <= 100),
  p2 numeric not null default 0.5 check (p2 > 0 and p2 <= 100),
  p3 numeric not null default 1 check (p3 > 0 and p3 <= 100),
  p4 numeric not null default 5 check (p4 > 0 and p4 <= 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.paper_search_history(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text not null,
  token_symbol text,
  token_name text,
  token_image text,
  market_cap_usd numeric,
  pair_created_at bigint,
  last_viewed_at timestamptz not null default now(),
  unique(user_id,token_address)
);
create index if not exists paper_search_history_user_recent_idx
  on public.paper_search_history(user_id,last_viewed_at desc);

create table if not exists public.paper_feedback(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page text not null default '/',
  message text not null check (char_length(message) between 3 and 2000),
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists paper_feedback_user_created_idx
  on public.paper_feedback(user_id,created_at desc);

create table if not exists public.paper_client_errors(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  area text not null,
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  page text,
  created_at timestamptz not null default now()
);
create index if not exists paper_client_errors_user_created_idx
  on public.paper_client_errors(user_id,created_at desc);
create index if not exists paper_client_errors_area_created_idx
  on public.paper_client_errors(area,created_at desc);

alter table public.paper_trade_presets enable row level security;
alter table public.paper_search_history enable row level security;
alter table public.paper_feedback enable row level security;
alter table public.paper_client_errors enable row level security;

revoke all on public.paper_trade_presets,public.paper_search_history,public.paper_feedback,public.paper_client_errors from anon;
revoke all on public.paper_trade_presets,public.paper_search_history,public.paper_feedback,public.paper_client_errors from authenticated;
grant select,insert,update,delete on public.paper_trade_presets to authenticated;
grant select,insert,update,delete on public.paper_search_history to authenticated;
grant select,insert on public.paper_feedback to authenticated;
grant select,insert on public.paper_client_errors to authenticated;

drop policy if exists paper_trade_presets_owner_select on public.paper_trade_presets;
drop policy if exists paper_trade_presets_owner_insert on public.paper_trade_presets;
drop policy if exists paper_trade_presets_owner_update on public.paper_trade_presets;
drop policy if exists paper_trade_presets_owner_delete on public.paper_trade_presets;
create policy paper_trade_presets_owner_select on public.paper_trade_presets for select to authenticated using ((select auth.uid())=user_id);
create policy paper_trade_presets_owner_insert on public.paper_trade_presets for insert to authenticated with check ((select auth.uid())=user_id);
create policy paper_trade_presets_owner_update on public.paper_trade_presets for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy paper_trade_presets_owner_delete on public.paper_trade_presets for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists paper_search_history_owner_select on public.paper_search_history;
drop policy if exists paper_search_history_owner_insert on public.paper_search_history;
drop policy if exists paper_search_history_owner_update on public.paper_search_history;
drop policy if exists paper_search_history_owner_delete on public.paper_search_history;
create policy paper_search_history_owner_select on public.paper_search_history for select to authenticated using ((select auth.uid())=user_id);
create policy paper_search_history_owner_insert on public.paper_search_history for insert to authenticated with check ((select auth.uid())=user_id);
create policy paper_search_history_owner_update on public.paper_search_history for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy paper_search_history_owner_delete on public.paper_search_history for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists paper_feedback_owner_select on public.paper_feedback;
drop policy if exists paper_feedback_owner_insert on public.paper_feedback;
create policy paper_feedback_owner_select on public.paper_feedback for select to authenticated using ((select auth.uid())=user_id);
create policy paper_feedback_owner_insert on public.paper_feedback for insert to authenticated with check ((select auth.uid())=user_id);

drop policy if exists paper_client_errors_owner_select on public.paper_client_errors;
drop policy if exists paper_client_errors_owner_insert on public.paper_client_errors;
create policy paper_client_errors_owner_select on public.paper_client_errors for select to authenticated using ((select auth.uid())=user_id);
create policy paper_client_errors_owner_insert on public.paper_client_errors for insert to authenticated with check (user_id is null or (select auth.uid())=user_id);
