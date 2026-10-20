-- Voice vocabulary must use the existing tenant-membership boundary. The worker
-- deliberately has no direct access to the private platform schema.
create or replace function public.redream_ai_capture_vocabulary(
  p_limit integer,
  p_capture_id uuid
)
returns jsonb
language sql
stable
set search_path=''
as $$
  with tenant as (select tenant_id from djm_os.captures where id=p_capture_id)
  select jsonb_build_object(
    'players',coalesce((select jsonb_agg(name) from (
      select coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) name
      from public.players p, tenant t
      where p.tenant_id=t.tenant_id
        and coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) is not null
      order by p.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'prospects',coalesce((select jsonb_agg(name) from (
      select sp.full_name name from djm_os.scouting_prospects sp, tenant t
      where sp.tenant_id=t.tenant_id and sp.full_name is not null
      order by sp.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'clubs',coalesce((select jsonb_agg(name) from (
      select o.name from djm_os.organisations o, tenant t
      where o.tenant_id=t.tenant_id and o.organisation_type='club'
      order by o.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(full_name) from (
      select p.full_name from djm_os.people p, tenant t
      where p.tenant_id=t.tenant_id and coalesce(p.person_type,'contact')<>'player'
      order by p.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'team_members',coalesce((select jsonb_agg(display_name order by display_name) from (
      select tm.display_name
      from djm_os.team_members tm, tenant t
      where tm.is_active
        and nullif(trim(tm.display_name),'') is not null
        and private.user_has_staff_tenant_access(t.tenant_id,tm.user_id)
      order by tm.display_name
      limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb)
  );
$$;

revoke all on function public.redream_ai_capture_vocabulary(integer,uuid) from public,anon,authenticated;
grant execute on function public.redream_ai_capture_vocabulary(integer,uuid) to service_role;

create or replace function public.redream_ai_retry_capture(p_capture_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
begin
  perform private.tell_assert_capture(p_capture_id,true);
  perform private.tell_request_tenant();

  select * into v_capture
  from djm_os.captures
  where id=p_capture_id
    and processing_version='tell_djm_v1' for update;

  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>(select auth.uid())
     and not exists (
       select 1 from djm_os.tell_djm_permissions p
       where p.user_id=(select auth.uid()) and p.tenant_id=private.tell_request_tenant()
         and p.permission_scope='full'
         and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access ReDream user can retry this';
  end if;

  -- A repeated tap or a worker finishing between receipt and retry is a read.
  -- Return the current state without restarting work or duplicating audit events.
  if v_capture.status not in ('partial','failed') then
    return jsonb_build_object('capture_id',p_capture_id,'status',v_capture.status);
  end if;

  if coalesce(v_capture.attempt_count,0)>=8 then
    raise exception 'This capture has already retried several times. Review it instead of retrying again.';
  end if;

  update djm_os.captures
  set status='queued',
      next_attempt_at=now(),
      locked_at=null,
      locked_by=null,
      error_message=null,
      last_error_code=null,
      completed_at=null
  where id=p_capture_id;

  insert into djm_os.events(tenant_id,
    event_type,actor_user_id,person_id,organisation_id,player_id,
    payload,source,confidence,occurred_at
  ) values (v_capture.tenant_id,
    'REDREAM_AI_RETRY_REQUESTED',
    (select auth.uid()),
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object('capture_id',p_capture_id),
    'tell_djm',1,now()
  );

  return jsonb_build_object('capture_id',p_capture_id,'status','queued');
end;
$$;

revoke all on function public.redream_ai_retry_capture(uuid) from public,anon;
grant execute on function public.redream_ai_retry_capture(uuid) to authenticated;

