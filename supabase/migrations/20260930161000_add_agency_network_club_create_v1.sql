-- First-class tenant-bound club creation for the Agency Network.
-- Reuses the canonical tenant club helper and records audit evidence.

create or replace function public.platform_server_agency_create_club(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_club_name text,
  p_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_club_name, '')), '');
  v_country text := nullif(btrim(coalesce(p_country, '')), '');
  v_existing_id uuid;
  v_org_id uuid;
  v_created boolean := false;
  v_result_name text;
  v_result_country text;
begin
  perform private.platform_server_assert_agency_operator(
    p_tenant_id,
    p_actor_user_id
  );

  if v_name is null or length(v_name) < 2 then
    raise exception 'club_name_required';
  end if;

  select o.id
  into v_existing_id
  from djm_os.organisations o
  where o.tenant_id = p_tenant_id
    and o.organisation_type = 'club'
    and lower(btrim(o.name)) = lower(v_name)
  order by o.created_at
  limit 1;

  v_created := v_existing_id is null;

  v_org_id := private.platform_server_agency_ensure_club(
    p_tenant_id,
    v_name,
    v_country
  );

  select o.name, o.country
  into v_result_name, v_result_country
  from djm_os.organisations o
  where o.id = v_org_id
    and o.tenant_id = p_tenant_id
    and o.organisation_type = 'club';

  if v_created then
    insert into djm_os.events (
      tenant_id,
      event_type,
      actor_user_id,
      organisation_id,
      payload,
      source,
      confidence,
      occurred_at
    )
    values (
      p_tenant_id,
      'CLUB_CREATED',
      p_actor_user_id,
      v_org_id,
      jsonb_build_object(
        'name', v_result_name,
        'country', v_result_country
      ),
      'agency_workspace',
      1,
      now()
    );
  end if;

  insert into platform.audit_events (
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    after_state,
    metadata
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    'user',
    case
      when v_created then 'platform.agency.club_created'
      else 'platform.agency.club_reused'
    end,
    'organisation',
    v_org_id::text,
    jsonb_build_object(
      'organisation_id', v_org_id,
      'name', v_result_name,
      'country', v_result_country,
      'created', v_created
    ),
    jsonb_build_object('source', 'agency_workspace')
  );

  return jsonb_build_object(
    'organisation_id', v_org_id,
    'name', v_result_name,
    'country', v_result_country,
    'created', v_created
  );
end;
$$;

revoke all on function public.platform_server_agency_create_club(
  uuid, uuid, text, text
) from public;

grant execute on function public.platform_server_agency_create_club(
  uuid, uuid, text, text
) to service_role;
