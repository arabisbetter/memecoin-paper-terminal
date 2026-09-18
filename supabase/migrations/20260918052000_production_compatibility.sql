-- Keep staging and production function signatures aligned after preserving
-- the existing production default on provider_reference.
create or replace function public.paper_admin_set_kyc_result(
  target_user uuid,
  verified boolean,
  provider text,
  provider_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_now timestamptz:=now();
begin
  if target_user is null then raise exception 'target user required'; end if;
  if provider is null or provider='' then raise exception 'provider required'; end if;

  insert into public.paper_funded_profiles(user_id,stage,kyc_status,kyc_provider,kyc_reference,kyc_verified_at,updated_at)
  values(
    target_user,
    case when verified then 'compliance_review' else 'rejected' end,
    case when verified then 'verified' else 'rejected' end,
    provider,provider_reference,
    case when verified then v_now else null end,
    v_now
  )
  on conflict(user_id) do update set
    stage=excluded.stage,kyc_status=excluded.kyc_status,kyc_provider=excluded.kyc_provider,
    kyc_reference=excluded.kyc_reference,kyc_verified_at=excluded.kyc_verified_at,updated_at=v_now;

  insert into public.paper_compliance_checks(user_id,check_type,status,provider,provider_reference,details,checked_at)
  values(target_user,'kyc',case when verified then 'clear' else 'blocked' end,provider,provider_reference,
         jsonb_build_object('manual_admin_decision',true),v_now);

  return jsonb_build_object('user_id',target_user,'kyc_status',case when verified then 'verified' else 'rejected' end);
end;
$$;
revoke all on function public.paper_admin_set_kyc_result(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.paper_admin_set_kyc_result(uuid,boolean,text,text) to service_role;
