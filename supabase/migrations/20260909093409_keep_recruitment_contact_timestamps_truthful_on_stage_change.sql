create or replace function public.djm_recruitment_set_stage(
  p_prospect_id uuid,
  p_stage text,
  p_next_action_at timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_current_stage text;
  v_first_contact timestamptz;
  v_last_contact timestamptz;
begin
  if not exists(
    select 1
    from djm_os.team_members tm
    where tm.user_id=(select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  if p_stage not in (
    'identified','researching','ready_to_contact','contacted','replied','call_booked',
    'interested','terms_discussed','agreement_sent','negotiating','signed','paused','declined','lost'
  ) then
    raise exception 'Invalid recruitment stage';
  end if;

  select recruitment_stage, first_contact_at, last_contact_at
  into v_current_stage, v_first_contact, v_last_contact
  from djm_os.scouting_prospects
  where id=p_prospect_id
    and linked_player_id is null;

  if v_current_stage is null then
    raise exception 'Recruitment target not found';
  end if;

  update djm_os.scouting_prospects
  set
    recruitment_stage=p_stage,
    first_contact_at=case
      when p_stage in ('contacted','replied','call_booked','interested','terms_discussed','agreement_sent','negotiating','signed')
        then coalesce(first_contact_at, now())
      else first_contact_at
    end,
    last_contact_at=case
      when p_stage='contacted'
       and v_current_stage in ('identified','researching','ready_to_contact')
        then coalesce(last_contact_at, now())
      else last_contact_at
    end,
    next_action_at=p_next_action_at,
    recruitment_notes=case
      when p_note is null or trim(p_note)='' then recruitment_notes
      else concat_ws(E'\n',nullif(recruitment_notes,''),trim(p_note))
    end,
    updated_at=now()
  where id=p_prospect_id
    and linked_player_id is null;

  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(
    'RECRUITMENT_STAGE_CHANGED',
    (select auth.uid()),
    jsonb_build_object(
      'prospect_id',p_prospect_id,
      'from_stage',v_current_stage,
      'stage',p_stage,
      'next_action_at',p_next_action_at
    ),
    'recruitment',
    1,
    now()
  );

  return jsonb_build_object('prospect_id',p_prospect_id,'stage',p_stage);
end
$function$;
