
-- ReDream task-assignee hardening: resolve agency colleagues reliably and
-- preserve shared responsibility for AI-created tasks.

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
  v_submitter uuid;
  v_name text := lower(trim(coalesce(p_spoken_name,'')));
  v_exact_count integer := 0;
  v_candidate_count integer := 0;
  v_user_id uuid;
  v_display_name text;
  v_candidates jsonb := '[]'::jsonb;
begin
  if v_name='' then
    return jsonb_build_object('resolved',false,'candidates','[]'::jsonb);
  end if;

  select c.tenant_id,c.submitted_by
  into v_tenant,v_submitter
  from djm_os.captures c
  where c.id=p_capture_id and c.processing_version='tell_djm_v1';

  if v_tenant is null then raise exception 'Capture not found'; end if;

  if v_name in ('me','myself','i') then
    select m.user_id,tm.display_name
    into v_user_id,v_display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=v_tenant
      and m.user_id=v_submitter
      and m.status='active'
      and tm.is_active
    limit 1;

    if v_user_id is not null then
      return jsonb_build_object(
        'resolved',true,
        'user_id',v_user_id,
        'display_name',coalesce(v_display_name,'You'),
        'candidates',jsonb_build_array(jsonb_build_object(
          'user_id',v_user_id,'label',coalesce(v_display_name,'You')
        ))
      );
    end if;
  end if;

  select count(*) into v_exact_count
  from platform.tenant_memberships m
  join djm_os.team_members tm on tm.user_id=m.user_id
  where m.tenant_id=v_tenant
    and m.status='active'
    and tm.is_active
    and (
      lower(trim(tm.display_name))=v_name
      or lower(split_part(trim(tm.display_name),' ',1))=v_name
    );

  if v_exact_count=1 then
    select m.user_id,tm.display_name into v_user_id,v_display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=v_tenant
      and m.status='active'
      and tm.is_active
      and (
        lower(trim(tm.display_name))=v_name
        or lower(split_part(trim(tm.display_name),' ',1))=v_name
      )
    limit 1;

    return jsonb_build_object(
      'resolved',true,
      'user_id',v_user_id,
      'display_name',v_display_name,
      'candidates',jsonb_build_array(jsonb_build_object(
        'user_id',v_user_id,'label',v_display_name
      ))
    );
  end if;

  -- Voice transcription can shift a short first-name vowel (for example Dapo -> Depo).
  -- Only accept this when the consonant skeleton identifies one unique active staff member.
  if length(v_name) between 3 and 12 then
    with matches as (
      select m.user_id,tm.display_name
      from platform.tenant_memberships m
      join djm_os.team_members tm on tm.user_id=m.user_id
      where m.tenant_id=v_tenant
        and m.status='active'
        and tm.is_active
        and abs(length(split_part(trim(tm.display_name),' ',1))-length(v_name))<=1
        and regexp_replace(lower(split_part(trim(tm.display_name),' ',1)),'[aeiouy]','','g')
            = regexp_replace(v_name,'[aeiouy]','','g')
      order by tm.display_name
      limit 6
    )
    select count(*),
           coalesce(jsonb_agg(jsonb_build_object(
             'user_id',user_id,'label',display_name
           ) order by display_name),'[]'::jsonb)
    into v_candidate_count,v_candidates
    from matches;

    if v_candidate_count=1 then
      select (v_candidates->0->>'user_id')::uuid,
             v_candidates->0->>'label'
      into v_user_id,v_display_name;

      return jsonb_build_object(
        'resolved',true,
        'user_id',v_user_id,
        'display_name',v_display_name,
        'matched_by','unique_voice_name',
        'candidates',v_candidates
      );
    end if;
  end if;

  with matches as (
    select m.user_id,tm.display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=v_tenant
      and m.status='active'
      and tm.is_active
      and (
        lower(split_part(trim(tm.display_name),' ',1))=v_name
        or lower(trim(tm.display_name)) like v_name||' %'
      )
    order by tm.display_name
    limit 6
  )
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'user_id',user_id,'label',display_name
         ) order by display_name),'[]'::jsonb)
  into v_candidate_count,v_candidates
  from matches;

  if v_candidate_count=1 then
    select (v_candidates->0->>'user_id')::uuid,
           v_candidates->0->>'label'
    into v_user_id,v_display_name;
    return jsonb_build_object(
      'resolved',true,
      'user_id',v_user_id,
      'display_name',v_display_name,
      'candidates',v_candidates
    );
  end if;

  return jsonb_build_object(
    'resolved',false,
    'candidates',v_candidates
  );
end;
$$;

revoke all on function public.redream_ai_resolve_team_member(uuid,text)
from public,anon,authenticated;
grant execute on function public.redream_ai_resolve_team_member(uuid,text)
to service_role;


create or replace function public.redream_ai_capture_vocabulary(
  p_limit integer,
  p_capture_id uuid
)
returns jsonb
language sql
stable
set search_path to ''
as $$
  with tenant as (
    select tenant_id from djm_os.captures where id=p_capture_id
  )
  select jsonb_build_object(
    'players',coalesce((select jsonb_agg(name) from (
      select coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) name
      from public.players p, tenant t
      where p.tenant_id=t.tenant_id
        and coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) is not null
      order by p.updated_at desc
      limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'prospects',coalesce((select jsonb_agg(name) from (
      select sp.full_name name
      from djm_os.scouting_prospects sp, tenant t
      where sp.tenant_id=t.tenant_id and sp.full_name is not null
      order by sp.updated_at desc
      limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'clubs',coalesce((select jsonb_agg(name) from (
      select o.name
      from djm_os.organisations o, tenant t
      where o.tenant_id=t.tenant_id and o.organisation_type='club'
      order by o.updated_at desc
      limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(full_name) from (
      select p.full_name
      from djm_os.people p, tenant t
      where p.tenant_id=t.tenant_id and coalesce(p.person_type,'contact')<>'player'
      order by p.updated_at desc
      limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'team_members',coalesce((select jsonb_agg(display_name) from (
      select tm.display_name
      from platform.tenant_memberships m
      join djm_os.team_members tm on tm.user_id=m.user_id
      join tenant t on t.tenant_id=m.tenant_id
      where m.status='active' and tm.is_active and nullif(trim(tm.display_name),'') is not null
      order by tm.display_name
      limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb)
  );
$$;


create or replace function public.redream_ai_approve_capture(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_tenant uuid;
  v_capture djm_os.captures%rowtype;
  v_action djm_os.tell_djm_actions%rowtype;
  v_result jsonb;
  v_owner uuid;
  v_responsible uuid[];
  v_pending integer;
  v_open_questions integer;
  v_failed integer;
  v_review integer;
  v_status text;
begin
  if v_actor is null then
    raise exception 'Sign in required' using errcode='42501';
  end if;

  perform private.tell_assert_capture(p_capture_id,true);
  v_tenant:=private.tell_request_tenant();

  select * into v_capture
  from djm_os.captures
  where id=p_capture_id and tenant_id=v_tenant
  for update;

  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>v_actor and not exists (
    select 1
    from djm_os.tell_djm_permissions p
    where p.tenant_id=v_tenant
      and p.user_id=v_actor
      and p.permission_scope='full'
      and p.is_enabled
  ) then
    raise exception 'Only the capture owner or a full-access agency user can approve this'
      using errcode='42501';
  end if;

  select count(*) into v_open_questions
  from djm_os.tell_djm_questions q
  where q.capture_id=p_capture_id and q.status='open';

  if v_open_questions>0 then
    raise exception 'Answer ReDream questions before approving this update';
  end if;

  for v_action in
    select *
    from djm_os.tell_djm_actions
    where capture_id=p_capture_id and status='pending'
    order by action_index,created_at
    for update
  loop
    if v_action.action_type='log_scout_observation' then
      select public.redream_ai_apply_scout_observation(
        p_capture_id,
        v_action.action_hash,
        v_action.action_index,
        v_action.confidence,
        v_action.evidence,
        v_action.resolved_payload
      ) into v_result;
    elsif v_action.action_type='complete_email_thread_task' then
      select public.redream_ai_complete_email_thread_task(
        p_capture_id,
        v_action.action_hash,
        v_action.action_index,
        v_action.confidence,
        v_action.evidence,
        v_action.resolved_payload
      ) into v_result;
    else
      select public.redream_ai_apply_action(
        p_capture_id,
        v_action.action_hash,
        v_action.action_index,
        v_action.action_type,
        v_action.confidence,
        v_action.evidence,
        v_action.resolved_payload
      ) into v_result;
    end if;

    if coalesce(v_result->>'status','')='failed' then
      raise exception 'One proposed update could not be applied';
    end if;

    if v_action.action_type='create_task'
       and coalesce(v_result->>'status','')='applied'
    then
      v_owner:=null;
      v_responsible:='{}'::uuid[];

      if nullif(v_action.resolved_payload->>'owner_user_id','') is not null then
        v_owner:=(v_action.resolved_payload->>'owner_user_id')::uuid;
      end if;

      if jsonb_typeof(v_action.resolved_payload->'responsible_user_ids')='array' then
        select coalesce(array_agg(distinct value::uuid),'{}'::uuid[])
        into v_responsible
        from jsonb_array_elements_text(v_action.resolved_payload->'responsible_user_ids');
      end if;

      if coalesce(cardinality(v_responsible),0)=0 and v_owner is not null then
        v_responsible:=array[v_owner];
      end if;

      if v_owner is null and coalesce(cardinality(v_responsible),0)>0 then
        v_owner:=v_responsible[1];
      end if;

      if v_owner is not null and not exists (
        select 1
        from platform.tenant_memberships m
        join djm_os.team_members tm on tm.user_id=m.user_id
        where m.tenant_id=v_tenant
          and m.user_id=v_owner
          and m.status='active'
          and tm.is_active
      ) then
        raise exception 'The proposed task owner is no longer an active agency member';
      end if;

      if exists (
        select 1
        from unnest(v_responsible) r(user_id)
        where not exists (
          select 1
          from platform.tenant_memberships m
          join djm_os.team_members tm on tm.user_id=m.user_id
          where m.tenant_id=v_tenant
            and m.user_id=r.user_id
            and m.status='active'
            and tm.is_active
        )
      ) then
        raise exception 'One proposed responsible person is no longer an active agency member';
      end if;

      if v_owner is not null then
        update djm_os.tasks t
        set owner_user_id=v_owner,
            updated_at=now()
        where t.tenant_id=v_tenant
          and t.id=(v_result->>'target_id')::uuid;
      end if;

      if coalesce(cardinality(v_responsible),0)>0 then
        insert into platform.work_responsibilities(
          tenant_id,work_kind,work_id,responsible_user_ids,revision,updated_by,updated_at
        )
        values(
          v_tenant,
          'task',
          (v_result->>'target_id')::uuid,
          v_responsible,
          1,
          v_actor,
          now()
        )
        on conflict(tenant_id,work_kind,work_id)
        do update
        set responsible_user_ids=excluded.responsible_user_ids,
            revision=platform.work_responsibilities.revision+1,
            updated_by=excluded.updated_by,
            updated_at=now();
      end if;

      update djm_os.tell_djm_actions a
      set after_json=(
            select to_jsonb(t)
            from djm_os.tasks t
            where t.tenant_id=v_tenant and t.id=a.target_id
          ),
          verification_json=coalesce(a.verification_json,'{}'::jsonb)
            || jsonb_build_object(
              'approved_by',v_actor,
              'approved_at',now(),
              'owner_user_id',v_owner,
              'responsible_user_ids',to_jsonb(v_responsible)
            ),
          updated_at=now()
      where a.id=v_action.id;

      insert into djm_os.events(
        tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at
      )
      values (
        v_tenant,
        'REDREAM_AI_TASK_OWNER_ASSIGNED',
        v_actor,
        jsonb_build_object(
          'capture_id',p_capture_id,
          'action_id',v_action.id,
          'owner_user_id',v_owner,
          'responsible_user_ids',to_jsonb(v_responsible)
        ),
        'redream_ai',
        1,
        now()
      );
    end if;
  end loop;

  select count(*) into v_pending
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='pending';

  select count(*) into v_failed
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='failed';

  select count(*) into v_review
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='needs_review';

  v_status:=case
    when v_failed>0 then 'partial'
    when v_review>0 then 'needs_review'
    when v_pending>0 then 'needs_review'
    else 'done'
  end;

  update djm_os.captures
  set status=v_status,
      completed_at=now(),
      receipt_json=coalesce(receipt_json,'{}'::jsonb)
        || jsonb_build_object(
          'status',v_status,
          'approval_required',v_pending>0,
          'approved_at',now(),
          'approved_by',v_actor
        )
  where id=p_capture_id and tenant_id=v_tenant;

  insert into djm_os.events(
    tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at
  )
  values (
    v_tenant,
    'REDREAM_AI_CAPTURE_APPROVED',
    v_actor,
    jsonb_build_object(
      'capture_id',p_capture_id,
      'status',v_status
    ),
    'redream_ai',
    1,
    now()
  );

  return jsonb_build_object(
    'ok',true,
    'status',v_status,
    'receipt',public.redream_ai_receipt(p_capture_id)
  );
end;
$$;

revoke all on function public.redream_ai_approve_capture(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.redream_ai_approve_capture(uuid)
to authenticated,service_role;

