-- Restore the established internal Undo implementation only where historical
-- migration drift left it absent. Never replace a newer deployed helper.
do $restore$
begin
  if to_regprocedure('public.redream_ai_undo_action_core_pre_email(uuid)') is null then
    execute $restore_definition$
CREATE OR REPLACE FUNCTION public.redream_ai_undo_action_core_pre_email(p_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_action djm_os.tell_djm_actions%rowtype;
  v_capture djm_os.captures%rowtype;
  v_deleted integer:=0;
begin
  perform private.tell_request_tenant();

  select * into v_action
  from djm_os.tell_djm_actions
  where id=p_action_id
    and status='applied'
    and undo_supported=true;

  if not found then
    raise exception 'This action cannot be undone';
  end if;

  perform private.tell_assert_capture(v_action.capture_id,true);

  select * into v_capture
  from djm_os.captures
  where id=v_action.capture_id;

  if not found then
    raise exception 'Capture not found';
  end if;

  if v_capture.submitted_by<>auth.uid()
     and not exists (
       select 1
       from djm_os.tell_djm_permissions p
       where p.user_id=auth.uid() and p.tenant_id=private.tell_request_tenant()
         and p.permission_scope='full'
         and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access ReDream user can undo this';
  end if;

  if v_action.action_type='create_task' then
    delete from djm_os.tasks
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and source='tell_djm:'||v_action.capture_id::text||':'||v_action.action_hash
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='log_interaction' then
    delete from djm_os.interactions
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and source_type='tell_djm';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='add_claim' then
    delete from djm_os.claims
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and source_key='tell:'||v_action.capture_id::text||':'||v_action.action_hash;
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='log_scout_observation' then
    delete from djm_os.scouting_reports
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and source_key='tell:'||v_action.capture_id::text||':'||v_action.action_hash
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='upsert_club_need'
        and coalesce((v_action.before_json->>'created')::boolean,false)=true then
    delete from djm_os.club_needs
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;
  end if;

  if v_deleted<>1 then
    raise exception 'This record changed after ReDream AI created it. Review it manually instead of rolling it back.';
  end if;

  update djm_os.tell_djm_actions
  set status='undone',
      undone_at=now(),
      updated_at=now()
  where id=v_action.id;

  insert into djm_os.events(tenant_id,
    event_type,actor_user_id,payload,source,confidence,occurred_at
  )
  values (v_capture.tenant_id,
    'REDREAM_AI_ACTION_UNDONE',
    auth.uid(),
    jsonb_build_object(
      'capture_id',v_action.capture_id,
      'action_id',v_action.id,
      'action_type',v_action.action_type,
      'target_id',v_action.target_id
    ),
    'tell_djm',
    1,
    now()
  );

  return jsonb_build_object(
    'capture_id',v_action.capture_id,
    'action_id',v_action.id,
    'undone',true
  );
end;
$function$;
$restore_definition$;
    revoke all on function public.redream_ai_undo_action_core_pre_email(uuid) from public,anon,authenticated,service_role;
  end if;
end
$restore$;
