begin;

create or replace function public.platform_server_account_context(
  p_tenant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'branding', coalesce((select to_jsonb(x) from (
      select display_name,short_name,portal_name,logo_asset,compact_logo_asset,
             primary_color,accent_color,support_email,website_url,phone
      from platform.tenant_branding
      where tenant_id=p_tenant_id
      limit 1
    ) x),'{}'::jsonb),
    'plan', coalesce((select to_jsonb(x) from (
      select id,plan_key,status,billing_mode,effective_from,effective_until,configuration
      from platform.tenant_plan_assignments
      where tenant_id=p_tenant_id and status in ('trialing','active')
      order by effective_from desc
      limit 1
    ) x),'{}'::jsonb),
    'plans', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.rank)
      from (
        select plan_key,display_name,rank,status,customer_segment,limits,metadata,
               monthly_price_cents,price_currency,price_is_from
        from platform.plan_catalog
        where status='active'
      ) p
    ),'[]'::jsonb),
    'staff_count', (
      select count(*)::integer from platform.tenant_memberships
      where tenant_id=p_tenant_id and status='active'
    ),
    'billing', coalesce((select to_jsonb(x) from (
      select status,billing_email,invoice_currency,tax_country,external_customer_reference,
             payment_provider,metadata,updated_at
      from platform.billing_accounts
      where tenant_id=p_tenant_id
      limit 1
    ) x),'{}'::jsonb),
    'pending_plan_change', coalesce((select to_jsonb(x) from (
      select id,from_plan_key,requested_plan_key,status,requested_at,resolved_at
      from platform.tenant_plan_change_requests
      where tenant_id=p_tenant_id and status='pending'
      order by requested_at desc
      limit 1
    ) x),'{}'::jsonb)
  );
$function$;

revoke all on function public.platform_server_account_context(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_account_context(uuid) to service_role;

create or replace function public.platform_server_player_profile_share_target(
  p_tenant_id uuid,
  p_player_id uuid,
  p_deal_room_id uuid default null,
  p_organisation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_deal jsonb := '{}'::jsonb;
  v_org_id uuid := p_organisation_id;
  v_org jsonb := '{}'::jsonb;
begin
  if p_deal_room_id is not null then
    select to_jsonb(x) into v_deal
    from (
      select id,title,organisation_id,source_person_id,player_id,tenant_id
      from djm_os.deal_rooms
      where id=p_deal_room_id and tenant_id=p_tenant_id and player_id=p_player_id
      limit 1
    ) x;
    if v_deal is null then
      return jsonb_build_object('deal',null,'organisation',null);
    end if;
    v_org_id := coalesce((v_deal->>'organisation_id')::uuid,v_org_id);
  end if;

  if v_org_id is not null then
    select to_jsonb(x) into v_org
    from (
      select id,name,country
      from djm_os.organisations
      where id=v_org_id and tenant_id=p_tenant_id
      limit 1
    ) x;
  end if;

  return jsonb_build_object(
    'deal', coalesce(v_deal,'{}'::jsonb),
    'organisation', coalesce(v_org,'{}'::jsonb)
  );
end;
$function$;

revoke all on function public.platform_server_player_profile_share_target(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_player_profile_share_target(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.platform_server_player_profile_mark_pitch_ready(
  p_tenant_id uuid,
  p_player_id uuid,
  p_deal_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_after jsonb;
begin
  update djm_os.deal_rooms
  set pitch_status='ready',updated_at=now()
  where id=p_deal_room_id and tenant_id=p_tenant_id and player_id=p_player_id
  returning to_jsonb(djm_os.deal_rooms.*) into v_after;
  return coalesce(v_after,'{}'::jsonb);
end;
$function$;

revoke all on function public.platform_server_player_profile_mark_pitch_ready(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_player_profile_mark_pitch_ready(uuid,uuid,uuid) to service_role;

commit;
