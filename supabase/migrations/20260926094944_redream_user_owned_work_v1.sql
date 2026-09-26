create or replace function private.redream_enforce_staff_task_owner()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if new.tenant_id is null then
    raise exception 'task_tenant_required';
  end if;

  if coalesce(new.status,'open') not in (
    'done',
    'completed',
    'cancelled'
  ) then
    if new.owner_user_id is null
       and v_actor is not null
       and exists (
         select 1
         from platform.tenant_memberships m
         join platform.tenants tenant
           on tenant.id=m.tenant_id
          and tenant.status='active'
         join djm_os.team_members tm
           on tm.user_id=m.user_id
          and tm.is_active
         where m.tenant_id=new.tenant_id
           and m.user_id=v_actor
           and m.status='active'
           and m.role in (
             'owner',
             'admin',
             'agent',
             'scout',
             'operations'
           )
       ) then
      new.owner_user_id:=v_actor;
    end if;

    if new.owner_user_id is null then
      raise exception 'open_task_owner_required';
    end if;

    if not exists (
      select 1
      from platform.tenant_memberships m
      join platform.tenants tenant
        on tenant.id=m.tenant_id
       and tenant.status='active'
      join djm_os.team_members tm
        on tm.user_id=m.user_id
       and tm.is_active
      where m.tenant_id=new.tenant_id
        and m.user_id=new.owner_user_id
        and m.status='active'
        and m.role in (
          'owner',
          'admin',
          'agent',
          'scout',
          'operations'
        )
    ) then
      raise exception 'task_owner_must_be_active_tenant_staff';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.redream_enforce_staff_task_owner()
from public,anon,authenticated;

grant execute on function private.redream_enforce_staff_task_owner()
to postgres,service_role;

drop trigger if exists redream_staff_task_owner_guard
on djm_os.tasks;

create trigger redream_staff_task_owner_guard
before insert or update on djm_os.tasks
for each row
execute function private.redream_enforce_staff_task_owner();

create or replace function public.platform_server_user_task_commands(
  p_tenant_id uuid,
  p_user_id uuid,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(
    1,
    least(coalesce(p_limit,12),50)
  );
  v_commands jsonb;
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

  with task_groups as (
    select
      lower(
        regexp_replace(
          trim(t.title),
          '\s+',
          ' ',
          'g'
        )
      ) as normalised_title,
      (
        array_agg(
          t.id
          order by
            t.due_at nulls last,
            t.created_at,
            t.id
        )
      )[1] as source_id,
      (
        array_agg(
          t.title
          order by
            t.due_at nulls last,
            t.created_at,
            t.id
        )
      )[1] as title,
      min(t.due_at) as due_at,
      count(*)::integer as task_count,
      max(t.priority)::integer as source_priority,
      jsonb_agg(
        jsonb_build_object(
          'task_id',t.id,
          'owner_user_id',t.owner_user_id,
          'due_at',t.due_at,
          'player_id',t.player_id,
          'club_need_id',t.club_need_id,
          'source',t.source
        )
        order by
          t.due_at nulls last,
          t.created_at,
          t.id
      ) as task_evidence
    from djm_os.tasks t
    where t.tenant_id=p_tenant_id
      and t.owner_user_id=p_user_id
      and t.status='open'
    group by lower(
      regexp_replace(
        trim(t.title),
        '\s+',
        ' ',
        'g'
      )
    )
  ),
  base as (
    select jsonb_build_object(
      'command_id','task:'||tg.source_id::text,
      'category','operations',
      'source_type','task',
      'source_id',tg.source_id,
      'owner_user_id',p_user_id,
      'command_type',
        case
          when tg.task_count>1
            then 'Consolidate duplicate follow-up'
          else 'Complete follow-up'
        end,
      'title',
        case
          when tg.task_count>1
            then tg.title||' ('||tg.task_count||' open copies)'
          else tg.title
        end,
      'recommended_action',
        case
          when tg.task_count>1
            then 'Complete the real follow-up, then close or merge your duplicate task records.'
          else 'Complete this follow-up and record the outcome.'
        end,
      'why_now',
        case
          when tg.due_at is not null
               and tg.due_at<now()
            then 'Your earliest open task is overdue.'
          when tg.due_at is not null
            then 'Your task is due soon.'
          else 'Your task is open with no due date.'
        end,
      'priority_score',
        least(
          100,
          case
            when tg.due_at is not null
                 and tg.due_at<now()
              then 72+least(
                23,
                ceil(
                  extract(
                    epoch from (now()-tg.due_at)
                  )/21600.0
                )::integer
              )
            when tg.due_at is not null
                 and tg.due_at<=now()+interval '24 hours'
              then 62
            when tg.due_at is null
              then 45
            else 35
          end
          + case
              when tg.task_count>1 then 6
              else 0
            end
        )::integer,
      'due_at',tg.due_at,
      'player_id',null,
      'club_need_id',null,
      'deal_room_id',null,
      'evidence',jsonb_build_object(
        'owner_user_id',p_user_id,
        'task_count',tg.task_count,
        'tasks',tg.task_evidence,
        'source_priority',tg.source_priority
      )
    ) as command
    from task_groups tg
    where tg.due_at is null
       or tg.due_at<=now()+interval '7 days'
       or tg.task_count>1
  ),
  profiled as (
    select
      b.command,
      profile,
      platform.command_evidence_health_v2(
        p_tenant_id,
        b.command
      ) as health,
      platform.command_actionability(
        b.command
      ) as base_actionability
    from base b
    cross join lateral
      platform.command_priority_profile(
        b.command
      ) profile
  ),
  enriched as (
    select command || jsonb_build_object(
      'base_priority_score',
        (command->>'priority_score')::integer,
      'priority_score',
        (profile->>'effective_score')::integer,
      'priority_band',
        profile->>'effective_band',
      'decision_basis',profile,
      'evidence_health',health,
      'actionability',
        base_actionability || jsonb_build_object(
          'evidence_gate','ready'
        )
    ) as command
    from profiled
  ),
  ranked as (
    select
      e.command,
      row_number() over(
        order by
          (e.command->>'priority_score')::integer desc,
          e.command->>'title'
      ) as rank
    from enriched e
  )
  select coalesce(
    jsonb_agg(
      command || jsonb_build_object(
        'rank',rank
      )
      order by rank
    ),
    '[]'::jsonb
  )
  into v_commands
  from ranked
  where rank<=v_limit;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'user_id',p_user_id,
    'generated_at',now(),
    'commands',v_commands,
    'truth_contract',jsonb_build_object(
      'ownership',
      'Only open tasks owned by this active agency user are returned.',
      'duplicates',
      'Duplicate grouping happens only inside one user’s task list. Identically named tasks owned by different people are never merged.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_user_task_commands(
  uuid,uuid,integer
) from public,anon,authenticated;

grant execute on function public.platform_server_user_task_commands(
  uuid,uuid,integer
) to postgres,service_role;

create or replace function public.platform_server_personal_home_commands(
  p_tenant_id uuid,
  p_user_id uuid,
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(
    1,
    least(coalesce(p_limit,8),12)
  );
  v_shared jsonb;
  v_user_tasks jsonb;
  v_commands jsonb;
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

  v_shared:=coalesce(
    public.platform_server_agency_decisions(
      p_tenant_id,
      25
    )->'commands',
    '[]'::jsonb
  );

  v_user_tasks:=coalesce(
    public.platform_server_user_task_commands(
      p_tenant_id,
      p_user_id,
      25
    )->'commands',
    '[]'::jsonb
  );

  with combined as (
    select c.value as command
    from jsonb_array_elements(v_shared) c
    where c.value->>'source_type'<>'task'

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
    'truth_contract',jsonb_build_object(
      'personal_tasks',
      'Task commands belong only to the signed-in user. Tasks owned by another user are excluded from this personal Home feed.',
      'agency_signals',
      'Non-task player, club, market and deal signals remain shared agency evidence.',
      'decision_memory',
      'Dismissal and snooze state is scoped to the user who made that decision.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_personal_home_commands(
  uuid,uuid,integer
) from public,anon,authenticated;

grant execute on function public.platform_server_personal_home_commands(
  uuid,uuid,integer
) to postgres,service_role;

create or replace function public.platform_server_user_commitment_summary(
  p_tenant_id uuid,
  p_user_id uuid,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(
    1,
    least(coalesce(p_limit,10),50)
  );
  v_items jsonb;
begin
  if not exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants tenant
      on tenant.id=m.tenant_id
     and tenant.status='active'
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'commitment_id',x.id,
        'proposal_id',x.proposal_id,
        'command_id',x.command_id,
        'task_id',x.task_id,
        'owner_user_id',x.owner_user_id,
        'status',x.status,
        'due_at',x.due_at,
        'completed_at',x.completed_at,
        'task_title',
          coalesce(
            x.task_title,
            x.metadata->>'task_title'
          ),
        'action_type',x.action_type,
        'created_at',x.created_at
      )
      order by
        case x.status
          when 'overdue' then 0
          when 'active' then 1
          when 'completed' then 2
          else 3
        end,
        x.due_at nulls last
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      c.*,
      t.title as task_title,
      p.action_type
    from platform.agency_commitments c
    left join djm_os.tasks t
      on t.id=c.task_id
     and t.tenant_id=c.tenant_id
    join platform.agency_action_proposals p
      on p.id=c.proposal_id
    where c.tenant_id=p_tenant_id
      and c.owner_user_id=p_user_id
    order by
      case c.status
        when 'overdue' then 0
        when 'active' then 1
        when 'completed' then 2
        else 3
      end,
      c.due_at nulls last
    limit v_limit
  ) x;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'user_id',p_user_id,
    'active_count',(
      select count(*)
      from platform.agency_commitments c
      where c.tenant_id=p_tenant_id
        and c.owner_user_id=p_user_id
        and c.status='active'
    ),
    'overdue_count',(
      select count(*)
      from platform.agency_commitments c
      where c.tenant_id=p_tenant_id
        and c.owner_user_id=p_user_id
        and c.status='overdue'
    ),
    'completed_count',(
      select count(*)
      from platform.agency_commitments c
      where c.tenant_id=p_tenant_id
        and c.owner_user_id=p_user_id
        and c.status='completed'
    ),
    'cancelled_count',(
      select count(*)
      from platform.agency_commitments c
      where c.tenant_id=p_tenant_id
        and c.owner_user_id=p_user_id
        and c.status='cancelled'
    ),
    'items',v_items,
    'truth_contract',jsonb_build_object(
      'ownership',
      'Only commitments owned by this active agency user are returned in their personal workspace.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_user_commitment_summary(
  uuid,uuid,integer
) from public,anon,authenticated;

grant execute on function public.platform_server_user_commitment_summary(
  uuid,uuid,integer
) to postgres,service_role;

create or replace function public.redream_autopilot_home(
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(
    1,
    least(coalesce(p_limit,8),12)
  );
  v_tenant uuid := private.redream_request_tenant();
  v_user uuid := auth.uid();
  v_home jsonb;
  v_personal jsonb;
  v_commands jsonb;
  v_policy jsonb;
  v_commitments jsonb;
  v_delegable jsonb;
  v_confirm jsonb;
  v_judgement jsonb;
  v_display_name text;
  v_slug text;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  select
    t.slug,
    b.display_name
  into
    v_slug,
    v_display_name
  from platform.tenants t
  left join platform.tenant_branding b
    on b.tenant_id=t.id
  where t.id=v_tenant
    and t.status='active';

  v_home:=public.platform_server_agency_home(
    v_tenant,
    v_limit
  );

  v_personal:=
    public.platform_server_personal_home_commands(
      v_tenant,
      v_user,
      v_limit
    );

  v_commands:=coalesce(
    v_personal->'commands',
    '[]'::jsonb
  );

  v_policy:=
    public.platform_server_autonomy_policy(
      v_tenant
    );

  v_commitments:=
    public.platform_server_user_commitment_summary(
      v_tenant,
      v_user,
      12
    );

  with items as (
    select
      c.value as command,
      coalesce(
        c.value->'actionability',
        '{}'::jsonb
      ) as actionability
    from jsonb_array_elements(v_commands) c
  )
  select
    coalesce(
      jsonb_agg(
        command
        order by (command->>'rank')::integer
      ) filter(
        where actionability->>'mode'='one_tap'
          and actionability->>'risk_level'='low'
          and coalesce(
            (
              actionability->>'undo_expected'
            )::boolean,
            false
          )=true
          and coalesce(
            (
              actionability->>'external_side_effect'
            )::boolean,
            false
          )=false
      ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        command
        order by (command->>'rank')::integer
      ) filter(
        where actionability->>'mode'='input_then_confirm'
      ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        command
        order by (command->>'rank')::integer
      ) filter(
        where not (
          actionability->>'mode'='one_tap'
          and actionability->>'risk_level'='low'
          and coalesce(
            (
              actionability->>'undo_expected'
            )::boolean,
            false
          )=true
          and coalesce(
            (
              actionability->>'external_side_effect'
            )::boolean,
            false
          )=false
        )
        and coalesce(
          actionability->>'mode',
          'review_only'
        )<>'input_then_confirm'
      ),
      '[]'::jsonb
    )
  into
    v_delegable,
    v_confirm,
    v_judgement
  from items;

  return jsonb_build_object(
    'contract_version',
      'redream_autopilot_v2',
    'generated_at',now(),
    'workspace',jsonb_build_object(
      'slug',v_slug,
      'display_name',
        coalesce(
          nullif(trim(v_display_name),''),
          v_slug
        )
    ),
    'attention',jsonb_build_object(
      'status',
        v_personal->>'status',
      'visible_signals',
        coalesce(
          (
            v_personal->>'visible_signals'
          )::integer,
          0
        ),
      'critical_count',
        coalesce(
          (
            v_personal->>'critical_count'
          )::integer,
          0
        ),
      'high_count',
        coalesce(
          (
            v_personal->>'high_count'
          )::integer,
          0
        ),
      'suppressed_by_decision_memory',
        coalesce(
          (
            v_personal
              ->>'suppressed_by_user_decision'
          )::integer,
          0
        ),
      'delegable',v_delegable,
      'confirm',v_confirm,
      'judgement',v_judgement
    ),
    'delegated_work',v_commitments,
    'changed_last_24h',
      coalesce(
        v_home->'changed_last_24h',
        '{}'::jsonb
      ),
    'value_proof_30d',
      coalesce(
        v_home->'value_proof_30d',
        '{}'::jsonb
      ),
    'command_quality_30d',
      coalesce(
        v_home->'command_quality_30d',
        '{}'::jsonb
      ),
    'autonomy',v_policy,
    'personal_work',jsonb_build_object(
      'user_id',v_user,
      'task_scope',
        'Only tasks owned by the signed-in agency user enter their personal Home task queue.',
      'commitment_scope',
        'Only commitments owned by the signed-in agency user enter their delegated work.',
      'shared_scope',
        'Player, club, market and deal signals remain shared agency evidence until they become assigned work.'
    ),
    'operating_principle',
      'Safe reversible operations can be automated, but personal tasks and reminders always belong to one accountable agency user.'
  );
end;
$function$;

revoke all on function public.redream_autopilot_home(integer)
from public,anon;

grant execute on function public.redream_autopilot_home(integer)
to authenticated,service_role;
