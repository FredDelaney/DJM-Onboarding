create or replace function public.platform_server_reset_demo_operating_history(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_meta jsonb;
  v_tasks integer:=0;
  v_outcomes integer:=0;
  v_commitments integer:=0;
  v_feedback integer:=0;
  v_proposals integer:=0;
  v_pulse integer:=0;
  v_audit integer:=0;
  v_deal_snapshots integer:=0;
  v_guardrails integer:=0;
begin
  select metadata into v_meta from platform.tenants where id=p_tenant_id;
  if v_meta is null then raise exception 'tenant_not_found'; end if;
  if not coalesce((v_meta->>'synthetic_test_tenant')::boolean,false) then raise exception 'demo_reset_requires_synthetic_tenant'; end if;

  delete from djm_os.tasks where tenant_id=p_tenant_id and source like 'agency_os:%'; get diagnostics v_tasks=row_count;
  delete from platform.agency_action_outcomes where tenant_id=p_tenant_id; get diagnostics v_outcomes=row_count;
  delete from platform.agency_commitments where tenant_id=p_tenant_id; get diagnostics v_commitments=row_count;
  delete from platform.agency_command_feedback where tenant_id=p_tenant_id; get diagnostics v_feedback=row_count;
  delete from platform.agency_action_proposals where tenant_id=p_tenant_id; get diagnostics v_proposals=row_count;
  delete from platform.agency_pulse_events where tenant_id=p_tenant_id; get diagnostics v_pulse=row_count;
  delete from platform.tenant_attention_state where tenant_id=p_tenant_id;
  delete from platform.deal_state_snapshots where tenant_id=p_tenant_id; get diagnostics v_deal_snapshots=row_count;
  delete from platform.deal_negotiation_guardrails where tenant_id=p_tenant_id; get diagnostics v_guardrails=row_count;
  delete from platform.audit_events
  where tenant_id=p_tenant_id and (
    action like 'agency_action.%' or action like 'deal_war_room.%' or action like 'deal_guardrails.%'
    or metadata->>'source' in ('agency_command_engine','deal_war_room') or entity_type='agency_action'
  );
  get diagnostics v_audit=row_count;

  return jsonb_build_object('tenant_id',p_tenant_id,'reset',true,'deleted',jsonb_build_object(
    'agency_os_tasks',v_tasks,'outcomes',v_outcomes,'commitments',v_commitments,'feedback',v_feedback,
    'proposals',v_proposals,'pulse_events',v_pulse,'audit_events',v_audit,'deal_state_snapshots',v_deal_snapshots,
    'negotiation_guardrails',v_guardrails));
end;
$$;

create or replace function public.platform_server_seed_demo_guardrails(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_meta jsonb;
  v_deal djm_os.deal_rooms%rowtype;
  v_actor uuid;
  v_g platform.deal_negotiation_guardrails%rowtype;
begin
  select metadata into v_meta from platform.tenants where id=p_tenant_id;
  if v_meta is null then raise exception 'tenant_not_found'; end if;
  if not coalesce((v_meta->>'synthetic_test_tenant')::boolean,false) then raise exception 'demo_guardrail_seed_requires_synthetic_tenant'; end if;
  select * into v_deal from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.title='Elias Novak to Westhaven FC' limit 1;
  if not found then raise exception 'northstar_elias_deal_not_found'; end if;
  select m.user_id into v_actor from platform.tenant_memberships m
  where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin')
  order by case m.role when 'owner' then 0 else 1 end,m.created_at limit 1;
  if v_actor is null then raise exception 'northstar_owner_not_found'; end if;

  insert into platform.deal_negotiation_guardrails(
    tenant_id,deal_room_id,status,target_outcome,acceptable_fallback,target_transfer_fee,minimum_transfer_fee,
    player_salary_target,player_salary_minimum,currency,salary_period,commission_guardrail,preferred_structure,
    concession_order,non_negotiables,walk_away_conditions,open_decisions,notes,created_by,updated_by,approved_by,approved_at
  ) values(
    p_tenant_id,v_deal.id,'approved',
    'Permanent transfer on terms acceptable to player and current club',
    'Loan with a clearly defined purchase mechanism',
    400000,350000,24000,22000,'EUR','monthly',
    jsonb_build_object('state','human_review_required','note','Synthetic Northstar demo only'),
    'Permanent transfer preferred',
    jsonb_build_array('structure','timing','secondary economics'),
    jsonb_build_array('No invented authority or registration claims'),
    jsonb_build_array('Material terms fall outside approved internal range without renewed approval'),
    jsonb_build_array('Confirm tax basis before relying on salary figures'),
    'Synthetic Northstar negotiation guardrails for product demonstration only',
    v_actor,v_actor,v_actor,now()
  )
  on conflict (tenant_id,deal_room_id) do update set
    status='approved',target_outcome=excluded.target_outcome,acceptable_fallback=excluded.acceptable_fallback,
    target_transfer_fee=excluded.target_transfer_fee,minimum_transfer_fee=excluded.minimum_transfer_fee,
    player_salary_target=excluded.player_salary_target,player_salary_minimum=excluded.player_salary_minimum,
    currency=excluded.currency,salary_period=excluded.salary_period,commission_guardrail=excluded.commission_guardrail,
    preferred_structure=excluded.preferred_structure,concession_order=excluded.concession_order,non_negotiables=excluded.non_negotiables,
    walk_away_conditions=excluded.walk_away_conditions,open_decisions=excluded.open_decisions,notes=excluded.notes,
    updated_by=v_actor,approved_by=v_actor,approved_at=now()
  returning * into v_g;

  return jsonb_build_object('tenant_id',p_tenant_id,'seeded',true,'deal_room_id',v_deal.id,'guardrails_id',v_g.id,'status',v_g.status,'version',v_g.version,'synthetic',true);
end;
$$;

create or replace function public.platform_server_seed_demo_story(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reset jsonb;
  v_core jsonb;
  v_access jsonb;
  v_history jsonb;
  v_guardrails jsonb;
begin
  v_reset:=public.platform_server_reset_demo_operating_history(p_tenant_id);
  v_core:=public.platform_server_seed_demo_story_core_v2(p_tenant_id);
  v_access:=public.platform_server_seed_demo_access_story(p_tenant_id);
  v_history:=public.platform_server_seed_demo_deal_history(p_tenant_id);
  v_guardrails:=public.platform_server_seed_demo_guardrails(p_tenant_id);
  return v_core || jsonb_build_object(
    'story_version','v5',
    'operating_reset',v_reset,
    'access_story',v_access,
    'deal_history',v_history,
    'negotiation_guardrails',v_guardrails,
    'deal_portfolio',public.platform_server_deal_portfolio_v4(p_tenant_id,10),
    'revenue_command',public.platform_server_revenue_command(p_tenant_id,8),
    'executive_home',public.platform_server_agency_home_executive(p_tenant_id,5)
  );
end;
$$;

revoke all on function public.platform_server_seed_demo_guardrails(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_seed_demo_guardrails(uuid) to service_role;;
