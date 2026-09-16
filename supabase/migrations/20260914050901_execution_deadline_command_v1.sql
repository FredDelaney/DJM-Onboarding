create or replace function public.platform_server_execution_deadline_command(
  p_tenant_id uuid,
  p_horizon_days integer default 90,
  p_limit integer default 100
)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
with params as (
  select greatest(1,least(coalesce(p_horizon_days,90),366)) horizon_days,greatest(1,least(coalesce(p_limit,100),500)) lim,now() now_at,current_date today
), player_names as (
  select p.id,coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name
  from public.players p where p.tenant_id=p_tenant_id
), events as (
  select p.id::text entity_id,'player'::text entity_type,'player_next_action'::text deadline_type,
    n.player_name||': '||coalesce(nullif(trim(p.next_action),''),'player next action') title,
    p.next_action_due::timestamptz deadline_at,
    jsonb_build_object('player_id',p.id,'player_name',n.player_name) context,
    jsonb_build_object('api_action','player_service_move_prepare','player_id',p.id,'instruction','Complete or deliberately reset the recorded player action.') next_action
  from public.players p join player_names n on n.id=p.id where p.tenant_id=p_tenant_id and p.next_action_due is not null and coalesce(p.football_status,'active') not in ('retired','inactive')

  union all
  select p.id::text,'player','contract_expiry',n.player_name||': contract expiry',p.contract_expiry::timestamptz,
    jsonb_build_object('player_id',p.id,'player_name',n.player_name,'contract_expiry',p.contract_expiry),
    jsonb_build_object('api_action','career_alignment','player_id',p.id,'instruction','Review the player contract and career plan against the recorded expiry date.')
  from public.players p join player_names n on n.id=p.id where p.tenant_id=p_tenant_id and p.contract_expiry is not null and coalesce(p.football_status,'active') not in ('retired','inactive')

  union all
  select s.id::text,'career_strategy','career_strategy_review',n.player_name||': career strategy review',s.review_due_at::timestamptz,
    jsonb_build_object('player_id',s.player_id,'player_name',n.player_name,'strategy_version',s.version,'strategy_status',s.status),
    jsonb_build_object('api_action','career_alignment','player_id',s.player_id,'instruction','Review the player-owned career strategy on its recorded review date.')
  from platform.player_career_strategies s join player_names n on n.id=s.player_id where s.tenant_id=p_tenant_id and s.status in ('draft','approved') and s.review_due_at is not null

  union all
  select s.id::text,'career_strategy','target_window_end',n.player_name||': target move window ends',(nullif(s.strategy#>>'{target_window,end_date}',''))::date::timestamptz,
    jsonb_build_object('player_id',s.player_id,'player_name',n.player_name,'strategy_version',s.version,'target_window',s.strategy->'target_window'),
    jsonb_build_object('api_action','career_alignment','player_id',s.player_id,'instruction','Review market execution before the player-defined target window ends.')
  from platform.player_career_strategies s join player_names n on n.id=s.player_id
  where s.tenant_id=p_tenant_id and s.status='approved' and nullif(s.strategy#>>'{target_window,end_date}','') is not null

  union all
  select d.id::text,'deal','deal_next_action',d.title||': next deal action',d.next_action_at,
    jsonb_build_object('deal_room_id',d.id,'player_id',d.player_id,'organisation_id',d.organisation_id,'stage',d.stage),
    jsonb_build_object('api_action','deal_war_room','deal_room_id',d.id,'instruction','Execute or deliberately reset the recorded deal action.')
  from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.status='active' and d.next_action_at is not null

  union all
  select cn.id::text,'club_need','club_need_expiry',o.name||': '||cn.title||' expires',cn.expires_at,
    jsonb_build_object('club_need_id',cn.id,'organisation_id',cn.organisation_id,'club_name',o.name,'need_type',cn.need_type,'priority',cn.priority),
    jsonb_build_object('api_action','demand_control_fast','club_need_id',cn.id,'instruction','Resolve whether the agency will serve, scout for or deliberately park this need before the recorded expiry.')
  from djm_os.club_needs cn join djm_os.organisations o on o.id=cn.organisation_id and o.tenant_id=cn.tenant_id
  where cn.tenant_id=p_tenant_id and cn.status='active' and cn.expires_at is not null

  union all
  select r.id::text,'player_request','player_request_due',n.player_name||': '||r.title||' due',r.due_at,
    jsonb_build_object('player_request_id',r.id,'player_id',r.player_id,'player_name',n.player_name,'request_type',r.request_type),
    jsonb_build_object('api_action','player_relationship_control','player_id',r.player_id,'instruction','Resolve the player request by its recorded due date.')
  from public.player_requests r join player_names n on n.id=r.player_id where r.status<>'completed' and r.due_at is not null

  union all
  select a.id::text,'representation_record','representation_record_end',n.player_name||': '||coalesce(a.title,a.agreement_type,'representation record')||' ends',a.end_date::timestamptz,
    jsonb_build_object('agreement_id',a.id,'player_id',a.player_id,'player_name',n.player_name,'agreement_type',a.agreement_type,'record_status',a.status),
    jsonb_build_object('api_action','representation_control','player_id',a.player_id,'instruction','Review the representation record before its recorded end date. This is records control, not a legal-validity judgement.')
  from public.player_agreements a join player_names n on n.id=a.player_id where a.status='active' and a.end_date is not null

  union all
  select pd.id::text,'player_document','document_expiry',n.player_name||': '||pd.title||' expires',pd.expires_at::timestamptz,
    jsonb_build_object('document_id',pd.id,'player_id',pd.player_id,'player_name',n.player_name,'document_type',pd.document_type),
    jsonb_build_object('api_action','representation_control','player_id',pd.player_id,'instruction','Review or replace the expiring player document if it remains operationally required.')
  from public.player_documents pd join player_names n on n.id=pd.player_id where pd.expires_at is not null
), bounded as (
  select e.*,(e.deadline_at::date-(select today from params))::integer days_to_deadline,
    case
      when e.deadline_at<(select now_at from params) then 'overdue'
      when e.deadline_at::date=(select today from params) then 'today'
      when e.deadline_at<=((select now_at from params)+interval '48 hours') then 'next_48_hours'
      when e.deadline_at<=((select now_at from params)+interval '7 days') then 'next_7_days'
      when e.deadline_at<=((select now_at from params)+interval '30 days') then 'next_30_days'
      else 'later_in_horizon' end deadline_state
  from events e
  where e.deadline_at is not null and e.deadline_at<=((select now_at from params)+make_interval(days=>(select horizon_days from params)))
), ranked as (
  select b.*,row_number() over(order by case deadline_state when 'overdue' then 1 when 'today' then 2 when 'next_48_hours' then 3 when 'next_7_days' then 4 when 'next_30_days' then 5 else 6 end,deadline_at,deadline_type,title) rn
  from bounded b
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'horizon_days',(select horizon_days from params),
  'summary',jsonb_build_object(
    'total_in_horizon',(select count(*) from bounded),
    'overdue',(select count(*) from bounded where deadline_state='overdue'),
    'today',(select count(*) from bounded where deadline_state='today'),
    'next_48_hours',(select count(*) from bounded where deadline_state='next_48_hours'),
    'next_7_days',(select count(*) from bounded where deadline_state='next_7_days'),
    'next_30_days',(select count(*) from bounded where deadline_state='next_30_days')
  ),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'rank',rn,'deadline_state',deadline_state,'deadline_type',deadline_type,'deadline_at',deadline_at,'days_to_deadline',days_to_deadline,
    'entity_type',entity_type,'entity_id',entity_id,'title',title,'context',context,'next_action',next_action
  ) order by rn) from ranked where rn<=(select lim from params)),'[]'::jsonb),
  'principle','Order agency work by factual recorded deadlines without collapsing unrelated player, deal, club and records events into an urgency score.',
  'truth_contract',jsonb_build_object(
    'dates','Only dates recorded in DJM are shown. The function does not infer league registration windows, legal deadlines or regulatory dates.',
    'overdue','Overdue means the recorded date/time has passed. It does not by itself determine commercial or legal consequence.',
    'representation','Agreement and document dates are records-control signals, not legal enforceability or compliance judgements.',
    'priority','Chronological ordering is not a claim that every earlier deadline is more strategically important than every later one; humans still make trade-offs.'
  )
);
$$;

revoke all on function public.platform_server_execution_deadline_command(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_execution_deadline_command(uuid,integer,integer) to service_role;
;
