create or replace function public.platform_server_agency_home(
  p_tenant_id uuid,
  p_command_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer := coalesce(p_command_limit,5);
  v_raw jsonb;
  v_commands jsonb;
  v_suppressed integer := 0;
  v_visible integer := 0;
  v_critical integer := 0;
  v_high integer := 0;
  v_status text;
  v_top jsonb;
  v_changes jsonb;
  v_value jsonb;
  v_quality jsonb;
begin
  if v_limit not between 1 and 12 then raise exception 'invalid_command_limit'; end if;
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id) then raise exception 'tenant_not_found'; end if;

  v_raw := public.platform_server_agency_commands(p_tenant_id,25);

  with expanded as (
    select c.value as command
    from jsonb_array_elements(coalesce(v_raw->'commands','[]'::jsonb)) c
  ), annotated as (
    select e.command,
      lf.feedback_type,
      lf.snoozed_until,
      lf.created_at as feedback_at,
      case
        when lf.feedback_type='snoozed' and lf.snoozed_until > now() then true
        when lf.feedback_type in ('dismissed','not_relevant') and lf.created_at >= now()-interval '14 days' then true
        when lf.feedback_type='completed' and lf.created_at >= now()-interval '2 days' then true
        else false
      end as suppressed
    from expanded e
    left join lateral (
      select f.feedback_type,f.snoozed_until,f.created_at
      from platform.agency_command_feedback f
      where f.tenant_id=p_tenant_id
        and f.command_id=e.command->>'command_id'
        and f.feedback_type <> 'shown'
      order by f.created_at desc
      limit 1
    ) lf on true
  ), visible as (
    select command || jsonb_build_object(
      'decision_state',coalesce(feedback_type,'new'),
      'snoozed_until',snoozed_until,
      'last_feedback_at',feedback_at
    ) as command
    from annotated
    where not suppressed
    order by (command->>'priority_score')::int desc,(command->>'rank')::int
    limit v_limit
  )
  select
    coalesce((select jsonb_agg(command order by (command->>'priority_score')::int desc,(command->>'rank')::int) from visible),'[]'::jsonb),
    (select count(*) from annotated where suppressed),
    (select count(*) from annotated where not suppressed),
    (select count(*) from annotated where not suppressed and (command->>'priority_score')::int >= 88),
    (select count(*) from annotated where not suppressed and (command->>'priority_score')::int between 72 and 87)
  into v_commands,v_suppressed,v_visible,v_critical,v_high;

  v_status := case when v_visible=0 then 'clear' when v_critical>0 then 'critical_attention' when v_high>0 then 'attention_needed' else 'normal' end;
  v_top := case when jsonb_array_length(v_commands)>0 then v_commands->0 else null end;

  select jsonb_build_object(
    'tell_djm_captures', (select count(*) from djm_os.captures c where c.tenant_id=p_tenant_id and c.created_at >= now()-interval '24 hours'),
    'tell_djm_actions_applied', (select count(*) from djm_os.tell_djm_actions a where a.tenant_id=p_tenant_id and a.applied_at >= now()-interval '24 hours'),
    'club_needs_created', (select count(*) from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.created_at >= now()-interval '24 hours'),
    'player_matches_created', (select count(*) from djm_os.player_matches m where m.tenant_id=p_tenant_id and m.created_at >= now()-interval '24 hours'),
    'opportunities_created', (select count(*) from public.player_opportunities o where o.tenant_id=p_tenant_id and o.created_at >= now()-interval '24 hours'),
    'tasks_completed', (select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.completed_at >= now()-interval '24 hours'),
    'interactions_logged', (select count(*) from djm_os.interactions i where i.tenant_id=p_tenant_id and i.created_at >= now()-interval '24 hours'),
    'meetings_created', (select count(*) from djm_os.meetings m where m.tenant_id=p_tenant_id and m.created_at >= now()-interval '24 hours'),
    'deals_updated', (select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.updated_at >= now()-interval '24 hours')
  ) into v_changes;

  v_value := public.platform_server_value_proof(p_tenant_id,30);
  v_quality := public.platform_server_command_quality(p_tenant_id,30);

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'attention',jsonb_build_object(
      'status',v_status,
      'visible_signals',v_visible,
      'critical_count',v_critical,
      'high_count',v_high,
      'suppressed_by_decision_memory',v_suppressed,
      'top_command',v_top,
      'commands',v_commands
    ),
    'changed_last_24h',v_changes,
    'value_proof_30d',v_value,
    'command_quality_30d',v_quality
  );
end;
$function$;

revoke all on function public.platform_server_agency_home(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_home(uuid,integer) to service_role;;
