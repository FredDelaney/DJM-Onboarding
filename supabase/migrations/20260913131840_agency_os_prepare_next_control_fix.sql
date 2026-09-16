create or replace function public.platform_server_prepare_deal_control_fix(
  p_tenant_id uuid,
  p_deal_room_id uuid,
  p_actor_user_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_war jsonb;
  v_fix jsonb;
  v_step_type text;
  v_result jsonb;
begin
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' then raise exception 'input_must_be_object'; end if;
  v_war:=public.platform_server_deal_war_room(p_tenant_id,p_deal_room_id);
  v_fix:=v_war->'next_control_fix';
  if v_fix is null or v_fix='null'::jsonb then raise exception 'no_control_fix_available'; end if;
  v_step_type:=nullif(trim(v_fix->>'step_type'),'');
  if v_step_type is null then raise exception 'control_fix_has_no_step_type'; end if;
  v_result:=public.platform_server_prepare_deal_step(p_tenant_id,p_deal_room_id,v_step_type,p_actor_user_id,p_input);
  return v_result || jsonb_build_object(
    'selected_from_live_war_room',true,
    'selected_step_type',v_step_type,
    'selected_control_fix',v_fix,
    'war_room_generated_at',v_war->>'generated_at'
  );
end;
$$;

revoke execute on function public.platform_server_prepare_deal_control_fix(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_prepare_deal_control_fix(uuid,uuid,uuid,jsonb) to service_role;;
