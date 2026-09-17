create or replace function
public.platform_server_refresh_customer_onboarding(
  p_tenant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_required_total integer;
  v_required_done integer;
  v_optional_done integer;
  v_percentage integer;
  v_status text;
  v_has_gone_live boolean := false;
begin
  if not exists (
    select 1
    from platform.tenants t
    where t.id=p_tenant_id
  ) then
    raise exception 'tenant_not_found';
  end if;

  if not exists (
    select 1
    from platform.tenant_customer_lifecycle l
    where l.tenant_id=p_tenant_id
  ) then
    perform public.platform_server_seed_customer_lifecycle(
      p_tenant_id,
      null,
      14
    );
  end if;

  update platform.tenant_onboarding_tasks ot
  set
    status='complete',
    completed_at=coalesce(ot.completed_at,now()),
    blocked_reason=null,
    updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='agency_profile'
    and ot.status not in ('complete','waived')
    and exists (
      select 1
      from platform.tenants t
      join platform.tenant_branding b
        on b.tenant_id=t.id
      join platform.tenant_settings s
        on s.tenant_id=t.id
      where t.id=p_tenant_id
        and nullif(trim(t.legal_name),'') is not null
        and nullif(trim(b.display_name),'') is not null
    );

  update platform.tenant_onboarding_tasks ot
  set
    status='complete',
    completed_at=coalesce(ot.completed_at,now()),
    blocked_reason=null,
    updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='branding'
    and ot.status not in ('complete','waived')
    and exists (
      select 1
      from platform.tenant_branding b
      where b.tenant_id=p_tenant_id
        and nullif(trim(b.display_name),'') is not null
        and nullif(trim(b.portal_name),'') is not null
    );

  update platform.tenant_onboarding_tasks ot
  set
    status='complete',
    completed_at=coalesce(ot.completed_at,now()),
    blocked_reason=null,
    updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='owner_access'
    and ot.status not in ('complete','waived')
    and exists (
      select 1
      from platform.tenant_memberships m
      where m.tenant_id=p_tenant_id
        and m.status='active'
        and m.role in ('owner','admin')
    );

  update platform.tenant_onboarding_tasks ot
  set
    status='complete',
    completed_at=coalesce(ot.completed_at,now()),
    blocked_reason=null,
    updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='player_import'
    and ot.status not in ('complete','waived')
    and exists (
      select 1
      from public.players p
      where p.tenant_id=p_tenant_id
    );

  update platform.tenant_onboarding_tasks ot
  set
    status='complete',
    completed_at=coalesce(ot.completed_at,now()),
    blocked_reason=null,
    updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='staff_invites'
    and ot.status not in ('complete','waived')
    and (
      select count(*)
      from platform.tenant_memberships m
      where m.tenant_id=p_tenant_id
        and m.status='active'
        and m.role <> 'player'
    ) >= 2;

  update platform.tenant_onboarding_tasks ot
  set
    status='complete',
    completed_at=coalesce(ot.completed_at,now()),
    blocked_reason=null,
    updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='player_portal'
    and ot.status not in ('complete','waived')
    and exists (
      select 1
      from platform.tenant_memberships m
      where m.tenant_id=p_tenant_id
        and m.status='active'
        and m.role='player'
    );

  update platform.tenant_onboarding_tasks ot
  set
    status='complete',
    completed_at=coalesce(ot.completed_at,now()),
    blocked_reason=null,
    updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='first_tell_djm'
    and ot.status not in ('complete','waived')
    and exists (
      select 1
      from platform.ai_usage_events a
      where a.tenant_id=p_tenant_id
        and a.feature_key='ai_assistant'
        and a.status in ('success','succeeded')
    );

  update platform.tenant_onboarding_tasks ot
  set
    status='complete',
    completed_at=coalesce(ot.completed_at,now()),
    blocked_reason=null,
    updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='first_opportunity'
    and ot.status not in ('complete','waived')
    and (
      exists (
        select 1
        from public.player_opportunities po
        where po.tenant_id=p_tenant_id
      )
      or exists (
        select 1
        from djm_os.club_needs cn
        where cn.tenant_id=p_tenant_id
      )
    );

  update platform.tenant_onboarding_tasks ot
  set
    status='complete',
    completed_at=coalesce(ot.completed_at,now()),
    blocked_reason=null,
    updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='billing_ready'
    and ot.status not in ('complete','waived')
    and (
      exists (
        select 1
        from platform.tenant_plan_assignments pa
        where pa.tenant_id=p_tenant_id
          and pa.status='active'
          and pa.billing_mode='internal'
      )
      or exists (
        select 1
        from platform.billing_accounts ba
        where ba.tenant_id=p_tenant_id
          and ba.status='active'
      )
    );

  update platform.tenant_onboarding_tasks ot
  set
    status='complete',
    completed_at=coalesce(ot.completed_at,now()),
    blocked_reason=null,
    updated_at=now()
  where ot.tenant_id=p_tenant_id
    and ot.task_key='custom_domain'
    and ot.status not in ('complete','waived')
    and exists (
      select 1
      from platform.tenant_domains d
      where d.tenant_id=p_tenant_id
        and d.domain_type='custom'
        and d.status in ('verified','active')
    );

  select
    count(*) filter (where required),
    count(*) filter (
      where required
        and status in ('complete','waived')
    ),
    count(*) filter (
      where not required
        and status in ('complete','waived')
    )
  into
    v_required_total,
    v_required_done,
    v_optional_done
  from platform.tenant_onboarding_tasks
  where tenant_id=p_tenant_id;

  v_percentage := case
    when v_required_total=0 then 100
    else round(
      (
        v_required_done::numeric
        / v_required_total::numeric
      ) * 100
    )::integer
  end;

  v_status := case
    when v_required_done=v_required_total
      then 'complete'
    when exists (
      select 1
      from platform.tenant_onboarding_tasks ot
      where ot.tenant_id=p_tenant_id
        and ot.required
        and ot.status='blocked'
    )
      then 'blocked'
    when v_required_done>0
      then 'in_progress'
    else 'not_started'
  end;

  select l.go_live_at is not null
  into v_has_gone_live
  from platform.tenant_customer_lifecycle l
  where l.tenant_id=p_tenant_id;

  if coalesce(v_has_gone_live,false) then
    v_status := 'complete';
  end if;

  update platform.tenant_customer_lifecycle
  set
    onboarding_status=v_status,
    updated_at=now()
  where tenant_id=p_tenant_id;

  return jsonb_build_object(
    'tenant_id',
    p_tenant_id,
    'status',
    v_status,
    'percentage',
    v_percentage,
    'required_total',
    v_required_total,
    'required_complete',
    v_required_done,
    'optional_complete',
    v_optional_done,
    'go_live_preserved',
    coalesce(v_has_gone_live,false)
  );
end;
$function$;


revoke all on function
  public.platform_server_refresh_customer_onboarding(uuid)
from public,anon,authenticated;

grant execute on function
  public.platform_server_refresh_customer_onboarding(uuid)
to service_role;
