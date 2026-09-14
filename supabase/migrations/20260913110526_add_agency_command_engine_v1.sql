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
      lower(regexp_replace(trim(t.title),'\\s+',' ','g')) as normalised_title,
      min(t.id) as source_id,
      min(t.title) as title,
      min(t.due_at) as due_at,
      count(*) as task_count,
      max(t.priority) as source_priority,
      jsonb_agg(jsonb_build_object('task_id',t.id,'due_at',t.due_at,'player_id',t.player_id,'club_need_id',t.club_need_id,'source',t.source) order by t.due_at nulls last) as task_evidence
    from djm_os.tasks t
    where t.tenant_id=p_tenant_id and t.status='open'
    group by lower(regexp_replace(trim(t.title),'\\s+',' ','g'))
  ),
  task_signals as (
    select
      'task:'||tg.source_id::text as command_id,
      'operations'::text as category,
      'task'::text as source_type,
      tg.source_id,
      case when tg.task_count > 1 then 'Consolidate duplicate follow-up' else 'Complete follow-up' end as command_type,
      case when tg.task_count > 1 then tg.title||' ('||tg.task_count||' open copies)' else tg.title end as title,
      case
        when tg.task_count > 1 then 'Complete the real follow-up, then close or merge the duplicate task records.'
        else 'Complete this follow-up and record the outcome.'
      end as recommended_action,
      case
        when tg.due_at is not null and tg.due_at < now() then 'The earliest open task is overdue.'
        when tg.due_at is not null then 'The task is due soon.'
        else 'The task is open with no due date.'
      end as why_now,
      least(100,
        case
          when tg.due_at is not null and tg.due_at < now() then 72 + least(23,ceil(extract(epoch from (now()-tg.due_at))/21600.0)::int)
          when tg.due_at is not null and tg.due_at <= now()+interval '24 hours' then 62
          when tg.due_at is null then 45
          else 35
        end
        + case when tg.task_count > 1 then 6 else 0 end
      )::int as priority_score,
      tg.due_at,
      null::uuid as player_id,
      null::uuid as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object('task_count',tg.task_count,'tasks',tg.task_evidence,'source_priority',tg.source_priority) as evidence
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
      'Review the player record and resolve the flagged issue.'::text as recommended_action,
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
      case
        when d.next_action_at is not null and d.next_action_at < now() then 'Deal follow-up overdue'
        when d.next_action_at is null then 'Deal missing next action'
        else 'Deal has gone quiet'
      end as command_type,
      d.title,
      coalesce(nullif(trim(d.next_action_text),''),nullif(trim(d.next_decision),''),'Set the next concrete deal action.') as recommended_action,
      case
        when d.next_action_at is not null and d.next_action_at < now() then 'The deal next action is overdue.'
        when d.next_action_at is null then 'An active deal has no next action scheduled.'
        else 'There has been no meaningful movement for at least seven days.'
      end as why_now,
      case
        when d.next_action_at is not null and d.next_action_at < now() then least(100,88 + least(10,floor(extract(epoch from (now()-d.next_action_at))/86400.0)::int))
        when d.next_action_at is null then 80
        else 74
      end::int as priority_score,
      d.next_action_at as due_at,
      d.player_id,
      d.club_need_id,
      d.id as deal_room_id,
      jsonb_build_object('stage',d.stage,'status',d.status,'probability',d.probability,'expected_commission',d.expected_commission,'currency',d.currency,'primary_blocker',d.primary_blocker,'last_meaningful_at',d.last_meaningful_at) as evidence
    from djm_os.deal_rooms d
    where d.tenant_id=p_tenant_id and d.status='active'
      and (
        (d.next_action_at is not null and d.next_action_at < now())
        or d.next_action_at is null
        or (d.last_meaningful_at is not null and d.last_meaningful_at < now()-interval '7 days')
      )
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
      least(94,
        case when n.need_type='confirmed' then 76 else 61 end
        + case when n.priority >= 4 then 7 when n.priority=3 then 4 else 0 end
        + case when n.expires_at is not null and n.expires_at <= now()+interval '7 days' then 10 else 0 end
      )::int as priority_score,
      n.expires_at as due_at,
      bm.player_id,
      n.id as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object(
        'organisation',o.name,
        'need_title',n.title,
        'position',n.position,
        'need_type',n.need_type,
        'need_priority',n.priority,
        'confirmed_at',n.confirmed_at,
        'expires_at',n.expires_at,
        'match_id',bm.id,
        'match_status',bm.status,
        'overall_score',bm.overall_score,
        'football_score',bm.football_score,
        'commercial_score',bm.commercial_score,
        'registration_score',bm.registration_score,
        'career_score',bm.career_score,
        'access_score',bm.access_score,
        'reasoning',bm.reasoning
      ) as evidence
    from djm_os.club_needs n
    left join djm_os.organisations o on o.id=n.organisation_id
    join lateral (
      select m.*
      from djm_os.player_matches m
      where m.tenant_id=p_tenant_id and m.club_need_id=n.id and m.status in ('suggested','review','shortlisted')
      order by m.overall_score desc nulls last,m.created_at desc
      limit 1
    ) bm on true
    where n.tenant_id=p_tenant_id and n.status='active'
      and not exists (
        select 1 from djm_os.deal_rooms d
        where d.tenant_id=p_tenant_id and d.club_need_id=n.id and d.status='active' and d.player_id=bm.player_id
      )
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
      least(92,
        case when n.need_type='confirmed' then 73 else 55 end
        + case when n.priority >= 4 then 7 when n.priority=3 then 4 else 0 end
        + case when n.expires_at is not null and n.expires_at <= now()+interval '7 days' then 10 else 0 end
      )::int as priority_score,
      n.expires_at as due_at,
      null::uuid as player_id,
      n.id as club_need_id,
      null::uuid as deal_room_id,
      jsonb_build_object('organisation',o.name,'need_title',n.title,'position',n.position,'need_type',n.need_type,'need_priority',n.priority,'confirmed_at',n.confirmed_at,'expires_at',n.expires_at) as evidence
    from djm_os.club_needs n
    left join djm_os.organisations o on o.id=n.organisation_id
    where n.tenant_id=p_tenant_id and n.status='active'
      and not exists (
        select 1 from djm_os.player_matches m
        where m.tenant_id=p_tenant_id and m.club_need_id=n.id and m.status in ('suggested','review','shortlisted')
      )
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
    select s.*,
      case when s.priority_score >= 88 then 'critical' when s.priority_score >= 72 then 'high' when s.priority_score >= 55 then 'medium' else 'low' end as priority_band,
      row_number() over(order by s.priority_score desc,s.due_at nulls last,s.title) as rank
    from all_signals s
  ),
  limited as (
    select * from ranked where rank <= v_limit
  )
  select jsonb_build_object(
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'status',case when not exists(select 1 from all_signals) then 'clear' when exists(select 1 from all_signals where priority_score>=88) then 'critical_attention' when exists(select 1 from all_signals where priority_score>=72) then 'attention_needed' else 'normal' end,
    'total_signals',(select count(*) from all_signals),
    'critical_count',(select count(*) from all_signals where priority_score>=88),
    'high_count',(select count(*) from all_signals where priority_score between 72 and 87),
    'commands',coalesce((select jsonb_agg(jsonb_build_object(
      'rank',rank,
      'command_id',command_id,
      'category',category,
      'source_type',source_type,
      'source_id',source_id,
      'command_type',command_type,
      'title',title,
      'recommended_action',recommended_action,
      'why_now',why_now,
      'priority_score',priority_score,
      'priority_band',priority_band,
      'due_at',due_at,
      'player_id',player_id,
      'club_need_id',club_need_id,
      'deal_room_id',deal_room_id,
      'evidence',evidence
    ) order by rank) from limited),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.platform_server_agency_commands(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_commands(uuid,integer) to service_role;

insert into platform.audit_events(tenant_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
select t.id,'system','agency_command_engine.enabled','tenant',t.id::text,jsonb_build_object('version','v1','deterministic_priority',true,'evidence_required',true),jsonb_build_object('migration','add_agency_command_engine_v1')
from platform.tenants t
where not exists (select 1 from platform.audit_events a where a.tenant_id=t.id and a.action='agency_command_engine.enabled');;
