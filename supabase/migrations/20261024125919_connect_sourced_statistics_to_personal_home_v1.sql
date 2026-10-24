-- Reuse the existing personal Home feed. No data rewrite, new task system,
-- public grants or publication/verification changes.
do $guard$
declare f oid:='public.platform_server_personal_home_commands(uuid,uuid,integer)'::regprocedure;
begin
 if (select md5(prosrc) from pg_proc where oid=f)<>'d423a50b964e9b572fbf30f52a50be4a'
  or has_function_privilege('anon',f,'execute') or has_function_privilege('authenticated',f,'execute')
  or not has_function_privilege('service_role',f,'execute') then
  raise exception 'Unexpected personal Home command contract';end if;
end;$guard$;

-- Share existing signal/enrichment bodies. Personal Home excludes other
-- staff task signals and routine verification BEFORE both admission limits.
-- Existing public feeds retain their exact all-signal behaviour and bounds.
do $feeds$
declare commands_oid oid:='public.platform_server_agency_commands(uuid,integer)'::regprocedure;
 decisions_oid oid:='public.platform_server_agency_decisions(uuid,integer)'::regprocedure;
 body text;
begin
 if (select md5(prosrc) from pg_proc where oid=commands_oid)<>'f567701a482aaa98656821eeb09dfe2d'
  or (select md5(prosrc) from pg_proc where oid=decisions_oid)<>'5b4ccaab113d67616116aeab8baa3e11'
  or to_regprocedure('private.agency_command_feed(uuid,integer,boolean,boolean)') is not null
  or to_regprocedure('private.agency_decision_feed(uuid,integer,boolean,boolean)') is not null then raise exception 'Unexpected agency feed definitions';end if;
 if has_function_privilege('anon',commands_oid,'execute') or has_function_privilege('authenticated',commands_oid,'execute')
  or has_function_privilege('anon',decisions_oid,'execute') or has_function_privilege('authenticated',decisions_oid,'execute')
  or not has_function_privilege('service_role',commands_oid,'execute') or not has_function_privilege('service_role',decisions_oid,'execute') then raise exception 'Unexpected agency feed grants';end if;
 select prosrc into body from pg_proc where oid=commands_oid;
 if length(body)-length(replace(body,'select * from task_signals',''))<>length('select * from task_signals')
  or length(body)-length(replace(body,'union all select * from player_review_signals',''))<>length('union all select * from player_review_signals') then raise exception 'Unexpected command source anchors';end if;
 body:=replace(body,'select * from task_signals','select * from task_signals where p_include_tasks');
 body:=replace(body,'union all select * from player_review_signals','union all select * from player_review_signals where p_include_reviews');
 execute format('create function private.agency_command_feed(p_tenant_id uuid,p_limit integer,p_include_tasks boolean,p_include_reviews boolean) returns jsonb language plpgsql security invoker set search_path='''' as %L',body);
 select prosrc into body from pg_proc where oid=decisions_oid;
 if length(body)-length(replace(body,'public.platform_server_agency_commands(p_tenant_id,25)',''))<>length('public.platform_server_agency_commands(p_tenant_id,25)') then raise exception 'Unexpected evidence feed anchor';end if;
 body:=replace(body,'public.platform_server_agency_commands(p_tenant_id,25)','private.agency_command_feed(p_tenant_id,25,p_include_tasks,p_include_reviews)');
 execute format('create function private.agency_decision_feed(p_tenant_id uuid,p_limit integer,p_include_tasks boolean,p_include_reviews boolean) returns jsonb language plpgsql security invoker set search_path='''' as %L',body);
end;$feeds$;
revoke all on function private.agency_command_feed(uuid,integer,boolean,boolean),private.agency_decision_feed(uuid,integer,boolean,boolean) from public,anon,authenticated,service_role;

create or replace function public.platform_server_agency_commands(p_tenant_id uuid,p_limit integer default 8)
returns jsonb language plpgsql security definer set search_path='' as $function$
begin return private.agency_command_feed(p_tenant_id,p_limit,true,true);end;
$function$;
create or replace function public.platform_server_agency_decisions(p_tenant_id uuid,p_limit integer default 12)
returns jsonb language plpgsql security definer set search_path='' as $function$
begin return private.agency_decision_feed(p_tenant_id,p_limit,true,true);end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_server_personal_home_commands(p_tenant_id uuid, p_user_id uuid, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer := greatest(
    1,
    least(coalesce(p_limit,8),12)
  );
  v_shared jsonb;
  v_user_tasks jsonb;
  v_commands jsonb;
  v_reviews jsonb;
  v_review_count integer:=0;
  v_visible integer:=0;
  v_critical integer:=0;
  v_high integer:=0;
  v_suppressed integer:=0;
  v_status text;
begin
  if not exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants tenant
      on tenant.id=m.tenant_id
     and tenant.status='active'
    join djm_os.team_members tm
      on tm.user_id=m.user_id
     and tm.is_active
    where m.tenant_id=p_tenant_id
      and m.user_id=p_user_id
      and m.status='active'
      and m.role in (
        'owner',
        'admin',
        'agent',
        'scout',
        'operations'
      )
  ) then
    raise exception 'active_tenant_staff_required';
  end if;

  v_shared:='[]'::jsonb;
  if private.user_is_tenant_admin(p_tenant_id,p_user_id) then
    v_shared:=coalesce(private.agency_decision_feed(p_tenant_id,25,false,false)->'commands','[]'::jsonb);
  end if;

  v_user_tasks:=coalesce(
    public.platform_server_user_task_commands(
      p_tenant_id,
      p_user_id,
      25
    )->'commands',
    '[]'::jsonb
  );

  -- Review work is read separately from the bounded business queue. Reuse
  -- canonical player-team relevance and edit permissions, never global staff.
  with candidates as (
    select p.id as player_id,s.id as review_id,s.requested_at as observed_at,
      'Player statistics suggested'::text as command_type,
      'A sourced statistics update is waiting for review.'::text as reason
    from public.player_source_refreshes s join public.players p on p.id=s.player_id and p.tenant_id=p_tenant_id
    where s.provider='agency_stats_proposal_v1' and s.status='needs_review'
    union all
    select p.id,null::uuid,p.review_required_at,'Player review required',
      coalesce(nullif(trim(p.review_reason),''),'The player record has been flagged for review.')
    from public.players p where p.tenant_id=p_tenant_id and p.review_required_at is not null and p.review_required_at<=now()+interval '7 days'
  ), authorised as (
    select c.*,p.preferred_name,p.first_name,p.last_name,private.player_home_relevant(p_tenant_id,p_user_id,p.id) as personal,count(*) over() as total
    from candidates c join public.players p on p.id=c.player_id and p.tenant_id=p_tenant_id
    join platform.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p_user_id and m.status='active'
    where (c.review_id is not null or m.role in ('owner','admin'))
      and p.archived_at is null and coalesce(p.football_status,'active') not in ('retired','inactive')
      and (m.role in ('owner','admin') or (m.role in ('agent','operations') and exists(
        select 1 from public.staff_player_access a where a.player_id=p.id and a.staff_user_id=p_user_id and a.can_edit)))
      and (m.role in ('owner','admin') or private.player_home_relevant(p_tenant_id,p_user_id,p.id))
    order by personal desc,c.observed_at desc,c.player_id,c.review_id
    limit 200
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'command_id',case when review_id is null then 'player_review:'||player_id::text else 'player_stats_review:'||review_id::text end,
    'source_type','player','source_id',player_id,'player_id',player_id,'command_type',command_type,
    'title',coalesce(nullif(trim(preferred_name),''),nullif(trim(concat_ws(' ',first_name,last_name)),''),'Player'),
    'why_now',reason,'recommended_action',case when review_id is null then 'Review the recorded player data before verifying.' else 'Compare the sources, then accept, correct or reject the suggested figures.' end,
    'priority_score',40,'base_priority_score',40,'priority_band','review','due_at',null,
    'evidence',case when review_id is null then jsonb_build_object('review_reason',reason) else jsonb_build_object('stats_review_id',review_id) end,
    'actionability',jsonb_build_object('mode','review_only','cta',case when review_id is null then 'Review player data' else 'Review suggested figures' end,'external_side_effect',false)
  ) order by personal desc,observed_at desc,player_id,review_id),'[]'::jsonb),coalesce(max(total),0)::integer
  into v_reviews,v_review_count from authorised;

  with combined as (
    select c.value as command
    from jsonb_array_elements(v_shared) c
    where c.value->>'source_type'<>'task' and not (c.value->>'source_type'='player' and c.value->>'command_type'='Player review required')

    union all

    select c.value
    from jsonb_array_elements(v_user_tasks) c
  ),
  annotated as (
    select
      c.command,
      lf.feedback_type,
      lf.snoozed_until,
      lf.created_at as feedback_at,
      case
        when lf.feedback_type='snoozed'
             and lf.snoozed_until>now()
          then true
        when lf.feedback_type in (
          'dismissed',
          'not_relevant'
        )
             and lf.created_at>=now()-interval '14 days'
          then true
        when lf.feedback_type='completed'
             and lf.created_at>=now()-interval '2 days'
          then true
        else false
      end as suppressed
    from combined c
    left join lateral (
      select
        f.feedback_type,
        f.snoozed_until,
        f.created_at
      from platform.agency_command_feedback f
      where f.tenant_id=p_tenant_id
        and f.actor_user_id=p_user_id
        and f.command_id=c.command->>'command_id'
        and f.feedback_type<>'shown'
      order by f.created_at desc
      limit 1
    ) lf on true
  ),
  visible_ranked as (
    select
      command || jsonb_build_object(
        'decision_state',
          coalesce(feedback_type,'new'),
        'snoozed_until',snoozed_until,
        'last_feedback_at',feedback_at
      ) as command,
      row_number() over(
        order by
          (command->>'priority_score')::integer desc,
          (command->>'base_priority_score')::integer desc,
          command->>'title'
      ) as rank
    from annotated
    where not suppressed
  ),
  visible as (
    select
      command || jsonb_build_object(
        'rank',rank
      ) as command,
      rank
    from visible_ranked
    order by rank
    limit v_limit
  )
  select
    coalesce(
      (
        select jsonb_agg(
          command
          order by rank
        )
        from visible
      ),
      '[]'::jsonb
    ),
    (
      select count(*)
      from annotated
      where suppressed
    )::integer,
    (
      select count(*)
      from annotated
      where not suppressed
    )::integer,
    (
      select count(*)
      from annotated
      where not suppressed
        and (command->>'priority_score')::integer>=88
    )::integer,
    (
      select count(*)
      from annotated
      where not suppressed
        and (command->>'priority_score')::integer
          between 72 and 87
    )::integer
  into
    v_commands,
    v_suppressed,
    v_visible,
    v_critical,
    v_high;

  -- Generic task completion/dismissal cannot hide a material review. Its
  -- canonical state or a confirmed statistics decision is the resolution.
  v_commands:=v_commands||v_reviews;
  v_visible:=v_visible+jsonb_array_length(v_reviews);

  v_status:=case
    when v_visible=0 then 'clear'
    when v_critical>0 then 'critical_attention'
    when v_high>0 then 'attention_needed'
    else 'normal'
  end;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'user_id',p_user_id,
    'generated_at',now(),
    'status',v_status,
    'visible_signals',v_visible,
    'critical_count',v_critical,
    'high_count',v_high,
    'suppressed_by_user_decision',v_suppressed,
    'commands',v_commands,
    'player_reviews_has_more',v_review_count>200,
    'truth_contract',jsonb_build_object(
      'personal_tasks',
      'Task commands belong only to the signed-in user. Tasks owned by another user are excluded from this personal Home feed.',
      'agency_signals',
      'Agency signals require administrator access; other staff receive their own assigned tasks.',
      'player_reviews','Authorised data reviews are separate from business limits; personal relevance is confirmed by the existing Home scope reader. Task completion never accepts, verifies or publishes player data.',
      'decision_memory',
      'Dismissal and snooze state is scoped to the user who made that decision.'
    )
  );
end;
$function$

-- CREATE OR REPLACE preserves existing OIDs, owners, configurations and ACLs.
