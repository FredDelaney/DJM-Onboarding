begin;

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
          i.id
          order by
            t.due_at nulls last,
            t.created_at,
            t.id
        ) filter (
          where i.id is not null
            and i.team_member_id=p_user_id
            and i.channel in (
              'google_email',
              'microsoft_email',
              'instagram_selected_chat',
              'whatsapp_selected_chat'
            )
            and num_nonnulls(i.person_id,i.player_id)=1
            and nullif(trim(i.summary),'') is not null
            and (
              (
                i.channel in ('google_email','microsoft_email')
                and lower(coalesce(i.direction,'')) in ('inbound','received')
              )
              or (
                i.channel in ('instagram_selected_chat','whatsapp_selected_chat')
                and lower(coalesce(i.direction,'')) not in ('outbound','sent')
              )
            )
        )
      )[1] as reply_interaction_id,
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
          'interaction_id',t.interaction_id,
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
    left join djm_os.interactions i
      on i.id=t.interaction_id
     and i.tenant_id=p_tenant_id
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
      'reply_interaction_id',tg.reply_interaction_id,
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
      'Duplicate grouping happens only inside one user’s task list. Identically named tasks owned by different people are never merged.',
      'reply_context',
      'A reply interaction is exposed only when the owned task points to one inbound connected email, Instagram or WhatsApp interaction for this same user with exactly one confirmed Network person or signed player identity.'
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

notify pgrst, 'reload schema';

commit;
