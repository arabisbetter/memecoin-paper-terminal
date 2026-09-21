-- Keep legal acceptance writes routed through the server endpoint while allowing
-- its authenticated Supabase client fallback in environments without a service-role key.
create policy legal_acceptances_insert_own
on public.legal_acceptances
for insert
to authenticated
with check ((select auth.uid())=user_id);
grant insert on table public.legal_acceptances to authenticated;
