-- Tell DJM person resolution and pg_trgm hardening.
-- Qualify similarity() under locked search_path, offer signed players when a
-- follow-up name was interpreted as a contact, and allow selecting that player
-- to rewrite the saved action before reprocessing.

do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f'
      and n.nspname='public'
      and p.proname like 'djm_tell_%'
  loop
    v_def:=pg_get_functiondef(r.oid);
    if v_def like '%similarity(%' then
      v_def:=replace(v_def,'extensions.similarity(','__DJM_EXT_SIM__(');
      v_def:=replace(v_def,'similarity(','extensions.similarity(');
      v_def:=replace(v_def,'__DJM_EXT_SIM__(','extensions.similarity(');
      execute v_def;
    end if;
  end loop;
end
$$;

do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='djm_tell_resolve_entity'
    and pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_entity_type text, p_name text, p_organisation_name text'
  limit 1;

  if v_oid is null then raise exception 'djm_tell_resolve_entity not found'; end if;
  v_def:=pg_get_functiondef(v_oid);
  v_def:=replace(
    v_def,
    'FUNCTION public.djm_tell_resolve_entity(',
    'FUNCTION public.djm_tell_resolve_entity_typed('
  );
  execute v_def;
end
$$;

create or replace function public.djm_tell_resolve_entity(
  p_user_id uuid,
  p_entity_type text,
  p_name text,
  p_organisation_name text default null
)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_primary jsonb;
  v_player jsonb;
  v_candidates jsonb:='[]'::jsonb;
begin
  v_primary:=public.djm_tell_resolve_entity_typed(
    p_user_id,p_entity_type,p_name,p_organisation_name
  );

  if p_entity_type<>'contact'
     or nullif(v_primary->>'resolved_id','') is not null then
    return v_primary;
  end if;

  v_player:=public.djm_tell_resolve_entity_typed(
    p_user_id,'player',p_name,null
  );

  select coalesce(
    jsonb_agg(
      candidate
      order by coalesce((candidate->>'score')::numeric,0) desc,
               candidate->>'label'
    ),
    '[]'::jsonb
  )
  into v_candidates
  from (
    select candidate
    from jsonb_array_elements(
      coalesce(v_primary->'candidates','[]'::jsonb)
    ) candidate
    union all
    select candidate
    from jsonb_array_elements(
      coalesce(v_player->'candidates','[]'::jsonb)
    ) candidate
  ) merged;

  return jsonb_build_object(
    'resolved_id',null,
    'resolved_label',null,
    'candidates',v_candidates,
    'matched_by','person_candidates'
  );
end;
$$;

create or replace function public.djm_tell_answer_question(
  p_question_id uuid,
  p_value jsonb
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_question djm_os.tell_djm_questions%rowtype;
  v_capture djm_os.captures%rowtype;
  v_selected jsonb:=p_value;
  v_entity_type text;
  v_entity_id uuid;
  v_alias text;
  v_action_key text;
  v_actions jsonb;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_question
  from djm_os.tell_djm_questions
  where id=p_question_id and status='open';
  if not found then raise exception 'Question is no longer open'; end if;

  select * into v_capture
  from djm_os.captures
  where id=v_question.capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>auth.uid()
     and not exists (
       select 1
       from djm_os.tell_djm_permissions p
       where p.user_id=auth.uid()
         and p.permission_scope='full'
         and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can answer this';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(
      coalesce(v_question.candidates,'[]'::jsonb)
    ) candidate
    where candidate=p_value
  ) then
    raise exception 'Selected answer is not one of the available choices';
  end if;

  if p_value->>'kind'='create_club' then
    select public.djm_tell_create_confirmed_club(
      v_capture.id,
      p_value->>'name',
      p_value->>'country'
    ) into v_selected;
  elsif p_value->>'kind'='create_contact' then
    select public.djm_tell_create_confirmed_contact(
      v_capture.id,
      p_value->>'full_name',
      nullif(p_value->>'organisation_id','')::uuid,
      p_value->>'role_title'
    ) into v_selected;
  end if;

  if v_question.field_key like 'entity:contact:%'
     and v_selected->>'entity_type'='player'
     and nullif(v_selected->>'entity_id','') is not null then
    v_action_key:=nullif(v_question.context_json->>'action_key','');

    if v_action_key is not null then
      select jsonb_agg(
        case
          when item->>'key'=v_action_key then
            jsonb_set(
              jsonb_set(
                item,
                '{contact_name}',
                'null'::jsonb,
                true
              ),
              '{player_name}',
              to_jsonb(v_selected->>'label'),
              true
            )
          else item
        end
        order by ord
      )
      into v_actions
      from jsonb_array_elements(
        coalesce(
          v_capture.extracted_json->'tell_djm_plan'->'actions',
          '[]'::jsonb
        )
      ) with ordinality as x(item,ord);

      if v_actions is not null then
        update djm_os.captures
        set extracted_json=jsonb_set(
          extracted_json,
          '{tell_djm_plan,actions}',
          v_actions,
          true
        )
        where id=v_capture.id;
      end if;
    end if;
  end if;

  update djm_os.tell_djm_questions
  set status='resolved',
      selected_value=v_selected,
      resolved_at=now()
  where id=p_question_id;

  update djm_os.captures
  set context_json=jsonb_set(
        coalesce(context_json,'{}'::jsonb),
        '{resolutions}',
        coalesce(context_json->'resolutions','[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'field_key',v_question.field_key,
            'value',v_selected
          )),
        true
      ),
      status='queued',
      next_attempt_at=now(),
      locked_at=null,
      locked_by=null,
      error_message=null,
      last_error_code=null
  where id=v_capture.id;

  v_entity_type:=nullif(v_selected->>'entity_type','');
  v_alias:=nullif(v_question.context_json->>'spoken_name','');

  if nullif(v_selected->>'entity_id','') is not null then
    begin
      v_entity_id:=(v_selected->>'entity_id')::uuid;
    exception when invalid_text_representation then
      v_entity_id:=null;
    end;
  end if;

  if v_entity_type in ('club','contact','player','prospect')
     and v_entity_id is not null
     and v_alias is not null then
    insert into djm_os.tell_djm_aliases(
      entity_type,
      entity_id,
      alias_text,
      normalised_alias,
      owner_user_id,
      source_capture_id
    )
    values (
      v_entity_type,
      v_entity_id,
      v_alias,
      lower(trim(regexp_replace(v_alias,'[^[:alnum:]]+',' ','g'))),
      v_capture.submitted_by,
      v_capture.id
    )
    on conflict (
      entity_type,
      entity_id,
      normalised_alias,
      owner_user_id
    )
    do update set
      confirmed_count=djm_os.tell_djm_aliases.confirmed_count+1,
      source_capture_id=excluded.source_capture_id,
      updated_at=now();
  end if;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    person_id,
    organisation_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    'TELL_DJM_QUESTION_ANSWERED',
    auth.uid(),
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object(
      'capture_id',v_capture.id,
      'question_id',v_question.id,
      'field_key',v_question.field_key
    ),
    'tell_djm',
    1,
    now()
  );

  return jsonb_build_object(
    'capture_id',v_capture.id,
    'status','queued'
  );
end;
$$;

with open_q as (
  select
    q.id,
    q.context_json->>'spoken_name' as spoken_name,
    c.submitted_by
  from djm_os.tell_djm_questions q
  join djm_os.captures c on c.id=q.capture_id
  where q.status='open'
    and q.field_key like 'entity:contact:%'
),
expanded as (
  select
    q.id,
    public.djm_tell_resolve_entity(
      q.submitted_by,
      'contact',
      q.spoken_name,
      null
    ) as resolution
  from open_q q
  where nullif(q.spoken_name,'') is not null
)
update djm_os.tell_djm_questions q
set candidates=case
  when jsonb_array_length(
    coalesce(e.resolution->'candidates','[]'::jsonb)
  )>0
    then e.resolution->'candidates'
      || jsonb_build_array(
        jsonb_build_object(
          'kind','review',
          'value','review',
          'label','Keep for review'
        )
      )
  else q.candidates
end
from expanded e
where q.id=e.id;

notify pgrst, 'reload schema';
