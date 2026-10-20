
-- Make task-owner matching resilient to one-character speech/transcription errors
-- and persist shared AI task responsibility using the existing responsibility model.

create or replace function private.redream_name_edit_distance_one(p_left text, p_right text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  a text := lower(regexp_replace(trim(coalesce(p_left,'')), '[^[:alnum:]]+', '', 'g'));
  b text := lower(regexp_replace(trim(coalesce(p_right,'')), '[^[:alnum:]]+', '', 'g'));
  la integer;
  lb integer;
  i integer := 1;
  j integer := 1;
  misses integer := 0;
  tmp text;
begin
  if a='' or b='' then return false; end if;
  if a=b then return true; end if;

  la:=char_length(a);
  lb:=char_length(b);
  if abs(la-lb)>1 then return false; end if;

  if la>lb then
    tmp:=a; a:=b; b:=tmp;
    la:=char_length(a); lb:=char_length(b);
  end if;

  if la=lb then
    for i in 1..la loop
      if substr(a,i,1)<>substr(b,i,1) then
        misses:=misses+1;
        if misses>1 then return false; end if;
      end if;
    end loop;
    return misses<=1;
  end if;

  while i<=la and j<=lb loop
    if substr(a,i,1)=substr(b,j,1) then
      i:=i+1;
      j:=j+1;
    else
      misses:=misses+1;
      if misses>1 then return false; end if;
      j:=j+1;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function private.redream_name_edit_distance_one(text,text)
from public,anon,authenticated;


create or replace function public.redream_ai_resolve_team_member(
  p_capture_id uuid,
  p_spoken_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_name text := lower(trim(regexp_replace(coalesce(p_spoken_name,''),'[^[:alnum:] ]+',' ','g')));
  v_candidate_count integer := 0;
  v_user_id uuid;
  v_display_name text;
  v_candidates jsonb := '[]'::jsonb;
begin
  v_name:=trim(regexp_replace(v_name,'[[:space:]]+',' ','g'));
  if v_name='' then
    return jsonb_build_object('resolved',false,'candidates','[]'::jsonb);
  end if;

  select c.tenant_id into v_tenant
  from djm_os.captures c
  where c.id=p_capture_id and c.processing_version='tell_djm_v1';

  if v_tenant is null then raise exception 'Capture not found'; end if;

  -- Prefer a unique exact full-name or first-name match.
  with members as (
    select
      m.user_id,
      coalesce(nullif(trim(p.display_name),''),nullif(trim(tm.display_name),''),'Team member') as display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    left join public.profiles p on p.id=m.user_id
    where m.tenant_id=v_tenant and m.status='active' and tm.is_active
  ),
  matches as (
    select user_id,display_name
    from members
    where lower(trim(display_name))=v_name
       or lower(split_part(trim(display_name),' ',1))=v_name
    order by display_name
    limit 6
  )
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'kind','team_member',
           'user_id',user_id,
           'label',display_name
         ) order by display_name),'[]'::jsonb)
  into v_candidate_count,v_candidates
  from matches;

  if v_candidate_count=1 then
    v_user_id:=(v_candidates->0->>'user_id')::uuid;
    v_display_name:=v_candidates->0->>'label';
    return jsonb_build_object(
      'resolved',true,
      'matched_by','exact',
      'user_id',v_user_id,
      'display_name',v_display_name,
      'candidates',v_candidates
    );
  elsif v_candidate_count>1 then
    return jsonb_build_object(
      'resolved',false,
      'matched_by','ambiguous_exact',
      'candidates',v_candidates
    );
  end if;

  -- Speech-to-text often changes one letter in a first name (for example Dapo -> Depo).
  -- Auto-resolve only when the name is at least four characters and exactly one
  -- active agency member is within a single edit. Otherwise return choices.
  if char_length(regexp_replace(v_name,' ','','g'))>=4 then
    with members as (
      select
        m.user_id,
        coalesce(nullif(trim(p.display_name),''),nullif(trim(tm.display_name),''),'Team member') as display_name
      from platform.tenant_memberships m
      join djm_os.team_members tm on tm.user_id=m.user_id
      left join public.profiles p on p.id=m.user_id
      where m.tenant_id=v_tenant and m.status='active' and tm.is_active
    ),
    matches as (
      select user_id,display_name
      from members
      where private.redream_name_edit_distance_one(
              v_name,
              lower(split_part(trim(display_name),' ',1))
            )
         or private.redream_name_edit_distance_one(
              regexp_replace(v_name,' ','','g'),
              regexp_replace(lower(trim(display_name)),' ','','g')
            )
      order by display_name
      limit 6
    )
    select count(*),
           coalesce(jsonb_agg(jsonb_build_object(
             'kind','team_member',
             'user_id',user_id,
             'label',display_name
           ) order by display_name),'[]'::jsonb)
    into v_candidate_count,v_candidates
    from matches;

    if v_candidate_count=1 then
      v_user_id:=(v_candidates->0->>'user_id')::uuid;
      v_display_name:=v_candidates->0->>'label';
      return jsonb_build_object(
        'resolved',true,
        'matched_by','single_edit',
        'user_id',v_user_id,
        'display_name',v_display_name,
        'candidates',v_candidates
      );
    elsif v_candidate_count>0 then
      return jsonb_build_object(
        'resolved',false,
        'matched_by','ambiguous_single_edit',
        'candidates',v_candidates
      );
    end if;
  end if;

  return jsonb_build_object(
    'resolved',false,
    'matched_by','none',
    'candidates','[]'::jsonb
  );
end;
$$;

revoke all on function public.redream_ai_resolve_team_member(uuid,text)
from public,anon,authenticated;
grant execute on function public.redream_ai_resolve_team_member(uuid,text)
to service_role;


create or replace function private.redream_ai_sync_task_responsibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := '{}'::uuid[];
  v_actor uuid;
  v_owner uuid;
  v_payload jsonb := coalesce(new.resolved_payload,'{}'::jsonb);
begin
  if new.action_type<>'create_task'
     or new.status<>'applied'
     or new.target_id is null
     or jsonb_typeof(v_payload->'responsible_user_ids')<>'array'
  then
    return new;
  end if;

  begin
    select coalesce(array_agg(x.id order by x.first_ord),'{}'::uuid[])
    into v_ids
    from (
      select (e.value)::uuid as id,min(e.ord) as first_ord
      from jsonb_array_elements_text(v_payload->'responsible_user_ids')
           with ordinality as e(value,ord)
      group by e.value
    ) x;
  exception when invalid_text_representation then
    raise exception 'Invalid task responsibility';
  end;

  if cardinality(v_ids)=0 then return new; end if;

  select c.submitted_by into v_actor
  from djm_os.captures c
  where c.id=new.capture_id and c.tenant_id=new.tenant_id;

  if v_actor is null then raise exception 'Capture owner not found'; end if;

  if exists (
    select 1
    from unnest(v_ids) id
    where not exists (
      select 1
      from platform.tenant_memberships m
      join djm_os.team_members tm on tm.user_id=m.user_id
      where m.tenant_id=new.tenant_id
        and m.user_id=id
        and m.status='active'
        and tm.is_active
    )
  ) then
    raise exception 'Task responsible person is no longer an active agency member';
  end if;

  begin
    v_owner:=nullif(v_payload->>'owner_user_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid task owner';
  end;
  v_owner:=coalesce(v_owner,v_ids[1]);

  if not (v_owner=any(v_ids)) then
    raise exception 'Task owner must be one of the responsible people';
  end if;

  update djm_os.tasks
  set owner_user_id=v_owner,
      updated_at=now()
  where id=new.target_id and tenant_id=new.tenant_id;

  if not found then raise exception 'Task target not found'; end if;

  insert into platform.work_responsibilities(
    tenant_id,work_kind,work_id,responsible_user_ids,revision,updated_by
  )
  values (
    new.tenant_id,'task',new.target_id,v_ids,1,v_actor
  )
  on conflict (tenant_id,work_kind,work_id)
  do update
  set responsible_user_ids=excluded.responsible_user_ids,
      revision=case
        when platform.work_responsibilities.responsible_user_ids
             is distinct from excluded.responsible_user_ids
          then platform.work_responsibilities.revision+1
        else platform.work_responsibilities.revision
      end,
      updated_by=excluded.updated_by,
      updated_at=case
        when platform.work_responsibilities.responsible_user_ids
             is distinct from excluded.responsible_user_ids
          then now()
        else platform.work_responsibilities.updated_at
      end;

  select to_jsonb(t) into new.after_json
  from djm_os.tasks t
  where t.id=new.target_id and t.tenant_id=new.tenant_id;

  new.verification_json:=coalesce(new.verification_json,'{}'::jsonb)
    || jsonb_build_object(
      'responsible_user_ids',to_jsonb(v_ids),
      'responsibility_synced',true
    );

  return new;
end;
$$;

revoke all on function private.redream_ai_sync_task_responsibility()
from public,anon,authenticated;

drop trigger if exists redream_ai_sync_task_responsibility
on djm_os.tell_djm_actions;

create trigger redream_ai_sync_task_responsibility
before insert or update
on djm_os.tell_djm_actions
for each row
execute function private.redream_ai_sync_task_responsibility();

