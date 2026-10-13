-- Task titles alone do not establish duplicates. Preserve each subject and owner.
create or replace function public.platform_server_agency_commands(
  p_tenant_id uuid,
  p_limit integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer := coalesce(p_limit,8);
  v_result jsonb;
begin
  if v_limit not between 1 and 25 then raise exception 'invalid_limit'; end if;
  if not exists (select 1 from platform.tenants t where t.id=p_tenant_id) then raise exception 'tenant_not_found'; end if;

  with
  task_groups as (
    select
      lower(regexp_replace(trim(t.title),'[[:space:]]+',' ','g')) as normalised_title,
      (array_agg(t.id order by t.due_at nulls last,t.created_at,t.id))[1] as source_id,
      (array_agg(t.title order by t.due_at nulls last,t.created_at,t.id))[1] as title,
      min(t.due_at) as due_at,
      count(*) as task_count,
      max(t.priority) as source_priority,
      t.player_id, t.club_need_id,
      max(coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''))) as player_name,
      jsonb_agg(jsonb_build_object('task_id',t.id,'due_at',t.due_at,'player_id',t.player_id,'club_need_id',t.club_need_id,'source',t.source) order by t.due_at nulls last,t.created_at,t.id) as task_evidence
    from djm_os.tasks t
    left join public.players p on p.id=t.player_id and p.tenant_id=p_tenant_id
    where t.tenant_id=p_tenant_id and t.status='open'
    group by lower(regexp_replace(trim(t.title),'[[:space:]]+',' ','g')),
      t.player_id,t.person_id,t.organisation_id,t.club_need_id,t.interaction_id,t.owner_user_id,t.task_type
  ),
  task_signals as (
    select
      'task:'||tg.source_id::text as command_id,
      'operations'::text as category,
      'task'::text as source_type,
      tg.source_id,
      case when tg.task_count > 1 then 'Consolidate duplicate follow-up' else 'Complete follow-up' end as command_type,
      case when tg.task_count > 1 then tg.title||coalesce(' · '||tg.player_name,'')||' ('||tg.task_count||' open copies)' else tg.title||coalesce(' · '||tg.player_name,'') end as title,
      case when tg.task_count > 1 then 'Complete the real follow-up, then close or merge the duplicate task records.' else 'Complete this follow-up and record the outcome.' end as recommended_action,
      case when tg.due_at is not null and tg.due_at < now() then 'The earliest open task is overdue.' when tg.due_at is not null then 'The task is due soon.' else 'The task is open with no due date.' end as why_now,
      least(100,
        case
          when tg.due_at is not null and tg.due_at < now() then 72 + least(23,ceil(extract(epoch from (now()-tg.due_at))/21600.0)::int)
          when tg.due_at is not null and tg.due_at <= now()+interval '24 hours' then 62
          when tg.due_at is null then 45
          else 35
        end + case when tg.task_count > 1 then 6 else 0 end
      )::int as priority_score,
      tg.due_at,
      tg.player_id as player_id,
      tg.club_need_id as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object('task_count',tg.task_count,'tasks',tg.task_evidence,'source_priority',tg.source_priority,'player_name',tg.player_name) as evidence
    from task_groups tg
    where tg.due_at is null or tg.due_at <= now()+interval '7 days' or tg.task_count > 1
  ),
  blocked_capture_signals as (
    select
      'capture:'||c.id::text as command_id,
      'intelligence'::text as category,
      'capture'::text as source_type,
      c.id as source_id,
      'Resolve blocked capture'::text as command_type,
      coalesce(nullif(trim(c.summary),''),'Tell DJM needs clarification') as title,
      'Answer the missing clarification so the update can be applied safely.'::text as recommended_action,
      'Tell DJM cannot complete this capture without human input.'::text as why_now,
      least(100,78 + least(17,floor(extract(epoch from (now()-c.created_at))/86400.0)::int))::int as priority_score,
      null::timestamptz as due_at,
      c.player_id,
      null::uuid as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object('capture_id',c.id,'created_at',c.created_at,'confidence',c.confidence,'error_code',c.last_error_code,'receipt',c.receipt_json) as evidence
    from djm_os.captures c
    where c.tenant_id=p_tenant_id and c.status='needs_input'
  ),
  player_next_action_signals as (
    select
      'player_action:'||p.id::text as command_id,
      'player_service'::text as category,
      'player'::text as source_type,
      p.id as source_id,
      'Player follow-up due'::text as command_type,
      coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') as title,
      coalesce(nullif(trim(p.next_action),''),'Set and complete the next player action.') as recommended_action,
      case when p.next_action_due < current_date then 'The player next action is overdue.' else 'The player next action is due today.' end as why_now,
      least(100,80 + least(18,greatest(0,current_date-p.next_action_due)))::int as priority_score,
      p.next_action_due::timestamptz as due_at,
      p.id as player_id,
      null::uuid as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object('agency_priority',p.agency_priority,'next_action',p.next_action,'next_action_due',p.next_action_due,'current_club',p.current_club) as evidence
    from public.players p
    where p.tenant_id=p_tenant_id and p.next_action_due is not null and p.next_action_due <= current_date
  ),
  player_review_signals as (
    select
      'player_review:'||p.id::text as command_id,
      'player_service'::text as category,
      'player'::text as source_type,
      p.id as source_id,
      'Player review required'::text as command_type,
      coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') as title,
      coalesce(nullif(trim(p.review_reason),''),'Player data needs checking.')||' Open the player profile and review the recorded data.' as recommended_action,
      coalesce(nullif(trim(p.review_reason),''),'The player record has been flagged for review.') as why_now,
      case when p.review_required_at <= now() then 82 else 58 end::int as priority_score,
      p.review_required_at as due_at,
      p.id as player_id,
      null::uuid as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object('review_reason',p.review_reason,'verification_status',p.verification_status,'review_required_at',p.review_required_at) as evidence
    from public.players p
    where p.tenant_id=p_tenant_id and p.review_required_at is not null and p.review_required_at <= now()+interval '7 days'
  ),
  contract_signals as (
    select
      'contract:'||p.id::text as command_id,
      'player_service'::text as category,
      'player'::text as source_type,
      p.id as source_id,
      'Contract decision approaching'::text as command_type,
      coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') as title,
      'Confirm the contract strategy, desired outcome and next action.'::text as recommended_action,
      'The current contract expiry is within 120 days.'::text as why_now,
      least(96,62 + greatest(0,round((120-(p.contract_expiry-current_date))::numeric/6)::int))::int as priority_score,
      p.contract_expiry::timestamptz as due_at,
      p.id as player_id,
      null::uuid as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object('contract_expiry',p.contract_expiry,'contract_status',p.contract_status,'current_club',p.current_club,'next_action',p.next_action,'next_action_due',p.next_action_due) as evidence
    from public.players p
    where p.tenant_id=p_tenant_id and p.contract_expiry between current_date and current_date+120
  ),
  opportunity_signals as (
    select
      'opportunity:'||o.id::text as command_id,
      'market'::text as category,
      'player_opportunity'::text as source_type,
      o.id as source_id,
      'Opportunity follow-up due'::text as command_type,
      coalesce(nullif(trim(o.club_name),''),'Player opportunity') as title,
      coalesce(nullif(trim(o.next_action),''),'Decide and record the next action for this opportunity.') as recommended_action,
      case when o.next_action_due < current_date then 'The opportunity next action is overdue.' else 'The opportunity next action is due today.' end as why_now,
      least(100,84 + least(14,greatest(0,current_date-o.next_action_due)))::int as priority_score,
      o.next_action_due::timestamptz as due_at,
      o.player_id,
      null::uuid as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object('stage',o.stage,'club_name',o.club_name,'country',o.country,'contact_name',o.contact_name,'last_contacted_at',o.last_contacted_at) as evidence
    from public.player_opportunities o
    where o.tenant_id=p_tenant_id and o.stage not in ('won','lost','paused') and o.next_action_due is not null and o.next_action_due <= current_date
  ),
  deal_signals as (
    select
      'deal:'||d.id::text as command_id,
      'deal'::text as category,
      'deal_room'::text as source_type,
      d.id as source_id,
      case when d.next_action_at is not null and d.next_action_at < now() then 'Deal follow-up overdue' when d.next_action_at is null then 'Deal missing next action' else 'Deal has gone quiet' end as command_type,
      d.title,
      coalesce(nullif(trim(d.next_action_text),''),nullif(trim(d.next_decision),''),'Set the next concrete deal action.') as recommended_action,
      case when d.next_action_at is not null and d.next_action_at < now() then 'The deal next action is overdue.' when d.next_action_at is null then 'An active deal has no next action scheduled.' else 'There has been no meaningful movement for at least seven days.' end as why_now,
      case when d.next_action_at is not null and d.next_action_at < now() then least(100,88 + least(10,floor(extract(epoch from (now()-d.next_action_at))/86400.0)::int)) when d.next_action_at is null then 80 else 74 end::int as priority_score,
      d.next_action_at as due_at,
      d.player_id,
      d.club_need_id,
      d.id as deal_room_id,
      jsonb_build_object('stage',d.stage,'status',d.status,'probability',d.probability,'expected_commission',d.expected_commission,'currency',d.currency,'primary_blocker',d.primary_blocker,'last_meaningful_at',d.last_meaningful_at) as evidence
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.status='active'
      and ((d.next_action_at is not null and d.next_action_at < now()) or d.next_action_at is null or (d.last_meaningful_at is not null and d.last_meaningful_at < now()-interval '7 days'))
  ),
  need_match_signals as (
    select
      'need_match:'||n.id::text as command_id,
      'market'::text as category,
      'club_need'::text as source_type,
      n.id as source_id,
      'Review player match for live club need'::text as command_type,
      coalesce(nullif(trim(o.name),''),nullif(trim(n.title),''),'Club need') as title,
      'Review the suggested player fit and decide whether to pitch, reject or gather more evidence.'::text as recommended_action,
      case when n.need_type='confirmed' then 'A confirmed club need has at least one suggested player match.' else 'A predicted club need has at least one suggested player match.' end as why_now,
      least(94,case when n.need_type='confirmed' then 76 else 61 end + case when n.priority >= 4 then 7 when n.priority=3 then 4 else 0 end + case when n.expires_at is not null and n.expires_at <= now()+interval '7 days' then 10 else 0 end)::int as priority_score,
      n.expires_at as due_at,
      bm.player_id,
      n.id as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object('organisation',o.name,'need_title',n.title,'position',n.position,'need_type',n.need_type,'need_priority',n.priority,'confirmed_at',n.confirmed_at,'expires_at',n.expires_at,'match_id',bm.id,'match_status',bm.status,'overall_score',bm.overall_score,'football_score',bm.football_score,'commercial_score',bm.commercial_score,'registration_score',bm.registration_score,'career_score',bm.career_score,'access_score',bm.access_score,'reasoning',bm.reasoning) as evidence
    from djm_os.club_needs n
    left join djm_os.organisations o on o.id=n.organisation_id
    join lateral (
      select m.* from djm_os.player_matches m
      where m.tenant_id=p_tenant_id and m.club_need_id=n.id and m.status in ('suggested','review','shortlisted')
      order by m.overall_score desc nulls last,m.created_at desc
      limit 1
    ) bm on true
    where n.tenant_id=p_tenant_id and n.status='active'
      and not exists (select 1 from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.club_need_id=n.id and d.status='active' and d.player_id=bm.player_id)
  ),
  unmatched_need_signals as (
    select
      'need_unmatched:'||n.id::text as command_id,
      'market'::text as category,
      'club_need'::text as source_type,
      n.id as source_id,
      'Live club need has no player match'::text as command_type,
      coalesce(nullif(trim(o.name),''),nullif(trim(n.title),''),'Club need') as title,
      'Review the need, search the roster and external network, or confirm that there is no suitable player.'::text as recommended_action,
      case when n.need_type='confirmed' then 'A confirmed club requirement currently has no suggested player match.' else 'A predicted requirement currently has no suggested player match.' end as why_now,
      least(92,case when n.need_type='confirmed' then 73 else 55 end + case when n.priority >= 4 then 7 when n.priority=3 then 4 else 0 end + case when n.expires_at is not null and n.expires_at <= now()+interval '7 days' then 10 else 0 end)::int as priority_score,
      n.expires_at as due_at,
      null::uuid as player_id,
      n.id as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object('organisation',o.name,'need_title',n.title,'position',n.position,'need_type',n.need_type,'need_priority',n.priority,'confirmed_at',n.confirmed_at,'expires_at',n.expires_at) as evidence
    from djm_os.club_needs n
    left join djm_os.organisations o on o.id=n.organisation_id
    where n.tenant_id=p_tenant_id and n.status='active'
      and not exists (select 1 from djm_os.player_matches m where m.tenant_id=p_tenant_id and m.club_need_id=n.id and m.status in ('suggested','review','shortlisted'))
  ),
  all_signals as (
    select * from task_signals
    union all select * from blocked_capture_signals
    union all select * from player_next_action_signals
    union all select * from player_review_signals
    union all select * from contract_signals
    union all select * from opportunity_signals
    union all select * from deal_signals
    union all select * from need_match_signals
    union all select * from unmatched_need_signals
  ),
  ranked as (
    select s.*,case when s.priority_score >= 88 then 'critical' when s.priority_score >= 72 then 'high' when s.priority_score >= 55 then 'medium' else 'low' end as priority_band,row_number() over(order by s.priority_score desc,s.due_at nulls last,s.title) as rank
    from all_signals s
  ),
  limited as (select * from ranked where rank <= v_limit)
  select jsonb_build_object(
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'status',case when not exists(select 1 from all_signals) then 'clear' when exists(select 1 from all_signals where priority_score>=88) then 'critical_attention' when exists(select 1 from all_signals where priority_score>=72) then 'attention_needed' else 'normal' end,
    'total_signals',(select count(*) from all_signals),
    'critical_count',(select count(*) from all_signals where priority_score>=88),
    'high_count',(select count(*) from all_signals where priority_score between 72 and 87),
    'commands',coalesce((select jsonb_agg(jsonb_build_object('rank',rank,'command_id',command_id,'category',category,'source_type',source_type,'source_id',source_id,'command_type',command_type,'title',title,'recommended_action',recommended_action,'why_now',why_now,'priority_score',priority_score,'priority_band',priority_band,'due_at',due_at,'player_id',player_id,'club_need_id',club_need_id,'deal_room_id',deal_room_id,'evidence',evidence) order by rank) from limited),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.platform_server_agency_commands(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_commands(uuid,integer) to service_role;;

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
          '[[:space:]]+',
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
            and num_nonnulls(i.person_id,i.player_id,i.prospect_id)=1
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
      t.player_id, t.club_need_id,
      max(coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''))) as player_name,
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
    left join public.players p on p.id=t.player_id and p.tenant_id=p_tenant_id
    left join djm_os.interactions i
      on i.id=t.interaction_id
     and i.tenant_id=p_tenant_id
    where t.tenant_id=p_tenant_id
      and t.owner_user_id=p_user_id
      and t.status='open'
    group by lower(
      regexp_replace(
        trim(t.title),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ), t.player_id,t.person_id,t.organisation_id,t.club_need_id,t.interaction_id,t.owner_user_id,t.task_type
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
            then tg.title||coalesce(' · '||tg.player_name,'')||' ('||tg.task_count||' open copies)'
          else tg.title||coalesce(' · '||tg.player_name,'')
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
      'player_id',tg.player_id,
      'club_need_id',tg.club_need_id,
      'deal_room_id',null,
      'evidence',jsonb_build_object(
        'owner_user_id',p_user_id,
        'task_count',tg.task_count,
        'tasks',tg.task_evidence,
        'source_priority',tg.source_priority,
        'player_name',tg.player_name
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
      'Possible copies must share an owner, player, contact, club, club need, conversation and task type. Similar titles alone do not establish duplicates.',
      'reply_context',
      'A reply interaction is exposed only when the owned task points to one inbound connected email, Instagram or WhatsApp interaction for this same user with exactly one confirmed Network person or signed player identity.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_user_task_commands(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_user_task_commands(uuid,uuid,integer) to postgres,service_role;
-- Revalidate the command before renewing an expired pending approval.
-- Applied actions retain their original payload and deadline for idempotent retries.
create or replace function public.platform_server_prepare_command_action(p_tenant_id uuid, p_command_id text, p_actor_user_id uuid, p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_feed jsonb;
  v_command jsonb;
  v_command_type text;
  v_source_type text;
  v_source_id uuid;
  v_action_type text;
  v_target_type text;
  v_target_id uuid;
  v_risk text;
  v_approval text;
  v_status text := 'proposed';
  v_title text;
  v_rationale text;
  v_payload jsonb := '{}'::jsonb;
  v_idempotency text;
  v_proposal platform.agency_action_proposals%rowtype;
  v_next_action text;
  v_next_at timestamptz;
  v_actionability jsonb;
  v_health jsonb;
  v_org_id uuid;
  v_player_id uuid;
  v_need_id uuid;
begin
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb)) <> 'object' then raise exception 'input_must_be_object'; end if;
  if trim(coalesce(p_command_id,''))='' then raise exception 'command_id_required'; end if;

  select m.role into v_role
  from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active'
    and m.role in ('owner','admin','agent','scout','operations')
  limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;

  v_feed := public.platform_server_agency_decisions(p_tenant_id,25);
  select c.value into v_command
  from jsonb_array_elements(coalesce(v_feed->'commands','[]'::jsonb)) c
  where c.value->>'command_id'=p_command_id
  limit 1;
  if v_command is null then raise exception 'command_no_longer_actionable'; end if;

  v_command_type := v_command->>'command_type';
  v_source_type := v_command->>'source_type';
  v_actionability := coalesce(v_command->'actionability','{}'::jsonb);
  v_health := coalesce(v_command->'evidence_health','{}'::jsonb);
  begin v_source_id := nullif(v_command->>'source_id','')::uuid; exception when invalid_text_representation then v_source_id := null; end;

  if v_source_type='player' and v_command_type='Player review required' then
    v_action_type := 'review_player_record'; v_target_type := 'player'; v_target_id := v_source_id;
    v_risk := 'low'; v_approval := 'review_only';
    v_title := 'Review player data: '||coalesce(v_command->>'title','player');
    v_rationale := coalesce(nullif(v_command->'evidence'->>'review_reason',''),v_command->>'why_now','Player data needs checking.');
    v_payload := jsonb_build_object('player_id',v_source_id,'review_reason',v_rationale);
  elsif v_actionability->>'action_type'='create_verification_task' then
    v_action_type := 'create_verification_task';
    v_target_type := coalesce(v_source_type,'unknown');
    v_target_id := v_source_id;
    v_risk := 'low';
    v_approval := 'confirm';
    v_title := 'Verify evidence: '||coalesce(v_command->>'title','agency decision');
    v_rationale := 'This item remains important, but the current evidence is not strong enough for normal action. Verify the underlying facts first.';

    if v_source_type='deal_room' then
      select d.organisation_id,d.player_id,d.club_need_id into v_org_id,v_player_id,v_need_id
      from djm_os.deal_rooms d where d.id=v_source_id and d.tenant_id=p_tenant_id;
    elsif v_source_type='club_need' then
      select n.organisation_id,n.id into v_org_id,v_need_id
      from djm_os.club_needs n where n.id=v_source_id and n.tenant_id=p_tenant_id;
      begin v_player_id:=nullif(v_command->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
    elsif v_source_type='player' then
      v_player_id:=v_source_id;
    end if;

    v_payload := jsonb_build_object(
      'title',coalesce(nullif(trim(p_input->>'title'),''),v_title),
      'due_at',coalesce(p_input->>'due_at',(now()+interval '6 hours')::text),
      'priority',case when (v_command->>'priority_score')::integer>=88 then 5 when (v_command->>'priority_score')::integer>=72 then 4 else 3 end,
      'organisation_id',v_org_id,
      'player_id',v_player_id,
      'club_need_id',v_need_id,
      'evidence_health',v_health,
      'blocked_action',v_actionability->'blocked_action',
      'verification_reasons',v_health->'verify_reasons'
    );

  elsif v_source_type='task' and v_command_type='Complete follow-up' then
    v_action_type := 'complete_task'; v_target_type := 'task'; v_target_id := v_source_id;
    v_risk := 'low'; v_approval := 'confirm';
    v_title := 'Complete: '||coalesce(v_command->>'title','follow-up');
    v_rationale := coalesce(v_command->>'why_now','The follow-up is currently actionable.');
    v_payload := jsonb_build_object('task_id',v_source_id);
  elsif v_source_type='task' and v_command_type='Consolidate duplicate follow-up' then
    v_action_type := 'consolidate_duplicate_tasks'; v_target_type := 'task_group'; v_target_id := v_source_id;
    v_risk := 'medium'; v_approval := 'review_only';
    v_title := 'Review duplicate follow-ups';
    v_rationale := 'These reminders share a title and linked records. Check whether they refer to the same work before closing one. No reminders have been merged or completed.';
    v_payload := jsonb_build_object('canonical_task_id',v_source_id,'tasks',v_command->'evidence'->'tasks');
  elsif v_source_type='deal_room' then
    v_action_type := 'set_deal_next_action'; v_target_type := 'deal_room'; v_target_id := v_source_id;
    v_risk := 'medium'; v_approval := 'input_then_confirm';
    v_title := 'Set the next action: '||coalesce(v_command->>'title','deal');
    v_rationale := coalesce(v_command->>'why_now','The deal requires a concrete next step.');
    v_next_action := nullif(trim(coalesce(p_input->>'next_action_text','')),'');
    begin v_next_at := nullif(p_input->>'next_action_at','')::timestamptz; exception when others then raise exception 'invalid_next_action_at'; end;
    if v_next_action is null or v_next_at is null then v_status := 'needs_input';
    elsif v_next_at <= now() then raise exception 'next_action_at_must_be_future'; end if;
    v_payload := jsonb_build_object('deal_room_id',v_source_id,'next_action_text',v_next_action,'next_action_at',v_next_at,'suggested_text',v_command->>'recommended_action');
  elsif v_source_type='club_need' and v_command_type='Live club need has no player match' then
    v_action_type := 'create_search_task'; v_target_type := 'club_need'; v_target_id := v_source_id;
    v_risk := 'low'; v_approval := 'confirm';
    v_title := 'Create search task: '||coalesce(v_command->>'title','club need');
    v_rationale := coalesce(v_command->>'why_now','The live need has no suitable match yet.');
    v_payload := jsonb_build_object('club_need_id',v_source_id,'title',coalesce(nullif(trim(p_input->>'title'),''),'Find options for '||coalesce(v_command->'evidence'->>'need_title',v_command->>'title','club need')),'due_at',coalesce(p_input->>'due_at',(now()+interval '1 day')::text),'priority',coalesce(nullif(p_input->>'priority','')::integer,4));
  elsif v_source_type='player' and v_command_type in ('Player follow-up due','Contract decision approaching') then
    v_action_type := 'create_player_task'; v_target_type := 'player'; v_target_id := v_source_id;
    v_risk := 'low'; v_approval := 'confirm';
    v_title := 'Create player action: '||coalesce(v_command->>'title','player');
    v_rationale := coalesce(v_command->>'why_now','The player requires an action.');
    v_payload := jsonb_build_object('player_id',v_source_id,'title',coalesce(nullif(trim(p_input->>'title'),''),v_command->>'recommended_action'),'due_at',coalesce(p_input->>'due_at',(now()+interval '1 day')::text),'priority',case when (v_command->>'priority_score')::integer >= 88 then 5 when (v_command->>'priority_score')::integer >= 72 then 4 else 3 end);
  elsif v_source_type='club_need' and v_command_type='Review player match for live club need' then
    v_action_type := 'create_deal_from_match'; v_target_type := 'club_need'; v_target_id := v_source_id;
    v_risk := 'high'; v_approval := 'review_only';
    v_title := 'Review opportunity creation: '||coalesce(v_command->>'title','club need');
    v_rationale := 'Creating a live deal changes the commercial pipeline. The OS can prepare the context, but this remains review-first.';
    v_payload := jsonb_build_object('club_need_id',v_source_id,'player_id',v_command->>'player_id','match',v_command->'evidence','evidence_health',v_health);
  elsif v_source_type='capture' then
    v_action_type := 'resolve_capture_clarification'; v_target_type := 'capture'; v_target_id := v_source_id;
    v_risk := 'high'; v_approval := 'review_only';
    v_title := 'Answer Tell DJM clarification';
    v_rationale := 'The capture is intentionally blocked because evidence or identity is ambiguous. Human input is required.';
    v_payload := jsonb_build_object('capture_id',v_source_id,'receipt',v_command->'evidence'->'receipt');
  else
    v_action_type := 'review_command'; v_target_type := coalesce(v_source_type,'unknown'); v_target_id := v_source_id;
    v_risk := 'high'; v_approval := 'review_only';
    v_title := 'Review: '||coalesce(v_command->>'title','agency command');
    v_rationale := 'No safe executable handler is approved for this command type yet.';
    v_payload := jsonb_build_object('command',v_command);
  end if;

  v_idempotency := md5(p_command_id||'|'||v_action_type||'|'||coalesce(p_input,'{}'::jsonb)::text);

  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key
  ) values (
    p_tenant_id,p_command_id,v_command_type,v_action_type,v_target_type,v_target_id,v_risk,v_approval,v_status,v_title,v_rationale,v_payload,p_actor_user_id,v_idempotency
  )
  on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied')
  do update set
    title=case when agency_action_proposals.status='applied' then agency_action_proposals.title else excluded.title end,
    rationale=case when agency_action_proposals.status='applied' then agency_action_proposals.rationale else excluded.rationale end,
    proposed_payload=case when agency_action_proposals.status='applied' then agency_action_proposals.proposed_payload else excluded.proposed_payload end,
    status=case when agency_action_proposals.status='applied' then agency_action_proposals.status else excluded.status end,
    requested_by=case when agency_action_proposals.status='applied' then agency_action_proposals.requested_by else excluded.requested_by end,
    expires_at=case when agency_action_proposals.status<>'applied' and agency_action_proposals.expires_at<=now() then excluded.expires_at else agency_action_proposals.expires_at end,
    updated_at=now()
  returning * into v_proposal;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','agency_action.prepared','agency_action',v_proposal.id::text,
    jsonb_build_object('command_id',p_command_id,'action_type',v_action_type,'risk_level',v_risk,'approval_mode',v_approval,'status',v_proposal.status),
    jsonb_build_object('source','agency_command_engine','priority_score',v_command->>'priority_score','decision_basis',v_command->'decision_basis','evidence_health',v_health));

  return jsonb_build_object(
    'proposal_id',v_proposal.id,'command_id',v_proposal.command_id,'action_type',v_proposal.action_type,
    'risk_level',v_proposal.risk_level,'approval_mode',v_proposal.approval_mode,'status',v_proposal.status,
    'title',v_proposal.title,'rationale',v_proposal.rationale,'payload',v_proposal.proposed_payload,
    'expires_at',v_proposal.expires_at,'executable',v_proposal.approval_mode <> 'review_only' and v_proposal.status='proposed',
    'decision_basis',v_command->'decision_basis','priority_score',(v_command->>'priority_score')::integer,'evidence_health',v_health
  );
end;
$$;

revoke all on function public.platform_server_prepare_command_action(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_prepare_command_action(uuid,text,uuid,jsonb) to service_role;;
