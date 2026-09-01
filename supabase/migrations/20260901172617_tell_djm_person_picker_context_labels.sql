-- Make Tell DJM ambiguity choices self-explanatory in the existing UI.
-- Candidate labels include entity type and useful club/organisation context.

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
    select case
      when candidate->>'entity_type'='contact' then
        jsonb_set(
          candidate,
          '{label}',
          to_jsonb(
            concat_ws(
              ' · ',
              candidate->>'label',
              'Contact',
              nullif(candidate->>'organisation_name','')
            )
          ),
          true
        )
      else candidate
    end as candidate
    from jsonb_array_elements(
      coalesce(v_primary->'candidates','[]'::jsonb)
    ) candidate

    union all

    select jsonb_set(
      candidate,
      '{label}',
      to_jsonb(
        concat_ws(
          ' · ',
          candidate->>'label',
          'Player',
          nullif(candidate->>'club','')
        )
      ),
      true
    ) as candidate
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
