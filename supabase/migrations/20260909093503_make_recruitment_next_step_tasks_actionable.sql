create or replace function public.djm_recruitment_set_next_action(
  p_prospect_id uuid,
  p_next_action_at timestamptz,
  p_note text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_name text;
  v_owner uuid;
  v_priority smallint;
  v_task_title text;
begin
  if not exists(
    select 1
    from djm_os.team_members tm
    where tm.user_id=(select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  if p_next_action_at is null then
    raise exception 'Next action date is required';
  end if;

  select
    full_name,
    coalesce(owner_user_id,(select auth.uid())),
    recruitment_priority
  into v_name,v_owner,v_priority
  from djm_os.scouting_prospects
  where id=p_prospect_id
    and linked_player_id is null
    and recruitment_stage not in ('signed','declined','lost','paused');

  if v_name is null then
    raise exception 'Active recruitment target not found';
  end if;

  v_task_title := case
    when nullif(trim(coalesce(p_note,'')),'') is not null
      then trim(p_note) || ' · ' || v_name
    else 'Follow up · ' || v_name
  end;

  update djm_os.scouting_prospects
  set
    next_action_at=p_next_action_at,
    owner_user_id=coalesce(owner_user_id,(select auth.uid())),
    recruitment_notes=case
      when p_note is null or trim(p_note)='' then recruitment_notes
      else concat_ws(E'\n',nullif(recruitment_notes,''),trim(p_note))
    end,
    updated_at=now()
  where id=p_prospect_id;

  delete from djm_os.tasks
  where source=('recruitment:'||p_prospect_id::text)
    and status not in ('completed','cancelled');

  insert into djm_os.tasks(
    title,
    task_type,
    owner_user_id,
    due_at,
    status,
    priority,
    source
  )
  values(
    v_task_title,
    'recruitment_followup',
    v_owner,
    p_next_action_at,
    'open',
    least(5,greatest(1,coalesce(v_priority,3))),
    'recruitment:'||p_prospect_id::text
  );

  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(
    'RECRUITMENT_NEXT_ACTION_SET',
    (select auth.uid()),
    jsonb_build_object(
      'prospect_id',p_prospect_id,
      'next_action_at',p_next_action_at,
      'note',nullif(trim(coalesce(p_note,'')),''),
      'task_title',v_task_title
    ),
    'recruitment',
    1,
    now()
  );

  return jsonb_build_object(
    'prospect_id',p_prospect_id,
    'next_action_at',p_next_action_at,
    'task_title',v_task_title
  );
end
$function$;
