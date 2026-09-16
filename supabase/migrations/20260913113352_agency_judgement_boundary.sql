create or replace function public.platform_server_judgement_boundary(
  p_tenant_id uuid,
  p_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_limit integer := coalesce(p_limit,12);
  v_home jsonb;
  v_commands jsonb;
  v_policy jsonb;
  v_delegable jsonb;
  v_confirm jsonb;
  v_judgement jsonb;
  v_visible integer;
  v_delegable_count integer;
  v_confirm_count integer;
  v_judgement_count integer;
begin
  if v_limit not between 1 and 12 then raise exception 'invalid_limit'; end if;
  v_home := public.platform_server_agency_home(p_tenant_id,v_limit);
  v_commands := coalesce(v_home->'attention'->'commands','[]'::jsonb);
  v_policy := public.platform_server_autonomy_policy(p_tenant_id);

  with items as (
    select c.value as command,
           c.value->'actionability' as a
    from jsonb_array_elements(v_commands) c
  )
  select
    coalesce(jsonb_agg(command order by (command->>'rank')::integer)
      filter(where a->>'mode'='one_tap'
               and a->>'risk_level'='low'
               and coalesce((a->>'undo_expected')::boolean,false)=true
               and coalesce((a->>'external_side_effect')::boolean,false)=false),'[]'::jsonb),
    coalesce(jsonb_agg(command order by (command->>'rank')::integer)
      filter(where a->>'mode'='input_then_confirm'),'[]'::jsonb),
    coalesce(jsonb_agg(command order by (command->>'rank')::integer)
      filter(where not (
        a->>'mode'='one_tap'
        and a->>'risk_level'='low'
        and coalesce((a->>'undo_expected')::boolean,false)=true
        and coalesce((a->>'external_side_effect')::boolean,false)=false
      ) and coalesce(a->>'mode','review_only')<>'input_then_confirm'),'[]'::jsonb)
  into v_delegable,v_confirm,v_judgement
  from items;

  v_visible := jsonb_array_length(v_commands);
  v_delegable_count := jsonb_array_length(v_delegable);
  v_confirm_count := jsonb_array_length(v_confirm);
  v_judgement_count := jsonb_array_length(v_judgement);

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'operating_status',v_home->'attention'->>'status',
    'attention_compression',jsonb_build_object(
      'visible_items',v_visible,
      'delegable_items',v_delegable_count,
      'confirmation_items',v_confirm_count,
      'judgement_items',v_judgement_count,
      'items_not_requiring_owner_judgement',v_delegable_count+v_confirm_count,
      'owner_judgement_ratio',case when v_visible=0 then 0 else round(v_judgement_count::numeric/v_visible,3) end
    ),
    'delegable',jsonb_build_object(
      'meaning','Low-risk, internal, reversible actions that the OS can prepare and execute within agency policy.',
      'automatic_execution_enabled',coalesce((v_policy->>'auto_execute_enabled')::boolean,false),
      'items',v_delegable
    ),
    'confirm',jsonb_build_object(
      'meaning','The OS can prepare the change, but a person must supply or confirm consequential inputs.',
      'items',v_confirm
    ),
    'judgement',jsonb_build_object(
      'meaning','These items require football, commercial or identity judgement and remain human-led.',
      'items',v_judgement
    ),
    'autonomy',v_policy,
    'principle','Automate reversible operations; preserve human control where judgement or external consequences matter.'
  );
end;
$function$;

revoke all on function public.platform_server_judgement_boundary(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_judgement_boundary(uuid,integer) to service_role;;
