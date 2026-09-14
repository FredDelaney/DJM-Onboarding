create or replace function public.platform_server_customer_success_command(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_items jsonb:='[]'::jsonb;
  v_t record;
  v_adoption jsonb;
  v_activation jsonb;
  v_snapshot jsonb;
  v_intervention jsonb;
  v_state text;
  v_count integer:=0;
begin
  for v_t in
    select t.id tenant_id,t.slug,coalesce(b.display_name,t.legal_name,t.slug) display_name,coalesce(l.stage,'onboarding') stage,l.onboarding_status,l.trial_started_at,l.trial_ends_at,l.contracted_monthly_cents,l.contract_currency,l.account_owner_name
    from platform.tenants t
    left join platform.tenant_branding b on b.tenant_id=t.id
    left join platform.tenant_customer_lifecycle l on l.tenant_id=t.id
    where t.status='active'
      and coalesce((t.metadata->>'internal_tenant')::boolean,false)=false
    order by case coalesce(l.stage,'onboarding') when 'at_risk' then 1 when 'trial' then 2 when 'onboarding' then 3 when 'demo' then 4 when 'live' then 5 else 6 end,coalesce(b.display_name,t.legal_name,t.slug)
    limit greatest(1,least(coalesce(p_limit,100),500))
  loop
    v_adoption:=public.platform_server_customer_adoption_path(v_t.tenant_id);
    v_activation:=public.platform_server_player_activation_command(v_t.tenant_id,500);
    v_snapshot:=public.platform_server_customer_snapshot(v_t.tenant_id);

    v_state:=case
      when coalesce(v_adoption->>'adoption_state','')='operating_foundation_incomplete' then 'operating_foundation_incomplete'
      when coalesce((v_activation#>>'{summary,eligible_players}')::int,0)>0 and coalesce((v_activation#>>'{summary,player_value_loop_active}')::int,0)=0 then 'player_value_not_activated'
      when v_t.stage='trial' and v_t.trial_ends_at is not null and v_t.trial_ends_at<=now()+interval '3 days' then 'trial_decision_due'
      when v_t.stage in ('onboarding','demo','trial') then 'activation_in_progress'
      when v_t.stage='live' then 'live_operating'
      else coalesce(v_t.stage,'unknown') end;

    v_intervention:=case
      when coalesce(v_adoption->>'adoption_state','')='operating_foundation_incomplete' then
        jsonb_build_object('type','complete_operating_foundation','instruction',coalesce(v_adoption#>>'{next_milestone,instruction}','Complete the next factual adoption milestone.'),'milestone_key',v_adoption#>>'{next_milestone,key}')
      when coalesce((v_activation#>>'{summary,eligible_players}')::int,0)>0 and coalesce((v_activation#>>'{summary,player_value_loop_active}')::int,0)=0 then
        jsonb_build_object('type','activate_first_player_value_loop','instruction','Get one real player through portal access, confirmed career strategy, Value Proof baseline and a recorded player review.')
      when v_t.stage='trial' and v_t.trial_ends_at is not null and v_t.trial_ends_at<=now()+interval '3 days' then
        jsonb_build_object('type','trial_decision','instruction','Review factual trial milestones and measured value before making the commercial decision.')
      when v_t.stage='live' then
        jsonb_build_object('type','operating_review','instruction','Review service control, player value loops, revenue execution and evidence-qualified learning on the normal customer cadence.')
      else jsonb_build_object('type','continue_activation','instruction','Continue the next recorded customer adoption milestone.') end;

    v_count:=v_count+1;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'rank',v_count,
      'tenant_id',v_t.tenant_id,
      'slug',v_t.slug,
      'display_name',v_t.display_name,
      'stage',v_t.stage,
      'onboarding_status',v_t.onboarding_status,
      'account_owner_name',v_t.account_owner_name,
      'trial_started_at',v_t.trial_started_at,
      'trial_ends_at',v_t.trial_ends_at,
      'contracted_monthly_cents',v_t.contracted_monthly_cents,
      'contract_currency',v_t.contract_currency,
      'customer_success_state',v_state,
      'next_intervention',v_intervention,
      'adoption',jsonb_build_object('state',v_adoption->'adoption_state','next_milestone',v_adoption->'next_milestone','milestones',v_adoption->'milestones'),
      'player_activation_summary',v_activation->'summary',
      'customer_snapshot',v_snapshot
    ));
  end loop;

  return jsonb_build_object(
    'available',true,
    'generated_at',now(),
    'customer_count',v_count,
    'items',v_items,
    'truth_contract',jsonb_build_object(
      'no_health_score','Customer Success is represented as factual operating milestones and blockers, not a proprietary health score.',
      'no_churn_prediction','DJM does not infer churn probability, satisfaction or willingness to renew from usage telemetry.',
      'interventions','Suggested interventions address recorded implementation gaps. They are not claims that completing one milestone guarantees retention or commercial success.',
      'privacy','The command is server-only and intended for authorised platform operations, never tenant-to-tenant visibility.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_customer_success_command(integer) from public,anon,authenticated;
grant execute on function public.platform_server_customer_success_command(integer) to service_role;;
