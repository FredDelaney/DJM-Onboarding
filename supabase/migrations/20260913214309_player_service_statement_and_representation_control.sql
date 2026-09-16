create or replace function public.platform_server_player_service_statement(p_tenant_id uuid,p_player_id uuid) returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_p public.players%rowtype;
  v_owner jsonb;
  v_strategy platform.player_career_strategies%rowtype;
  v_market jsonb;
  v_requests jsonb;
  v_assurance jsonb;
  v_player_assurance jsonb;
  v_last timestamptz;
begin
  select * into v_p from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;

  select jsonb_build_object('user_id',m.user_id,'name',coalesce(tm.display_name,u.email),'role_title',tm.role_title)
  into v_owner
  from platform.tenant_memberships m
  join auth.users u on u.id=m.user_id
  left join djm_os.team_members tm on tm.user_id=m.user_id
  where m.tenant_id=p_tenant_id and m.user_id=v_p.primary_staff_user_id and m.status='active' limit 1;

  select * into v_strategy from platform.player_career_strategies s
  where s.tenant_id=p_tenant_id and s.player_id=p_player_id and s.status in ('draft','approved')
  order by case when s.status='approved' then 0 else 1 end,s.version desc limit 1;

  select jsonb_build_object(
    'active_deals',count(*) filter(where d.status='active'),
    'stages',coalesce(jsonb_object_agg(stage,cnt) filter(where stage is not null),'{}'::jsonb),
    'market_matches',(select count(*) from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=p_player_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active')),
    'active_opportunities',(select count(*) from public.player_opportunities po where po.player_id=p_player_id and po.stage not in ('won','lost')),
    'club_names_hidden',true
  ) into v_market
  from (
    select d.stage,count(*) cnt from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.status='active' group by d.stage
  ) x right join (select 1) one on true;

  select jsonb_build_object(
    'open',count(*) filter(where pr.status<>'completed'),
    'overdue',count(*) filter(where pr.status<>'completed' and pr.due_at is not null and pr.due_at<now())
  ) into v_requests from public.player_requests pr where pr.player_id=p_player_id;

  v_assurance:=public.platform_server_service_assurance_v2(p_tenant_id,500);
  select value into v_player_assurance from jsonb_array_elements(coalesce(v_assurance->'players','[]'::jsonb)) where value->>'player_id'=p_player_id::text limit 1;

  select max(ts) into v_last from (
    values
      (v_p.updated_at),
      (v_strategy.updated_at),
      ((select max(coalesce(d.last_meaningful_at,d.updated_at)) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id)),
      ((select max(t.updated_at) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.player_id=p_player_id)),
      ((select max(pr.updated_at) from public.player_requests pr where pr.player_id=p_player_id))
  ) a(ts);

  return jsonb_build_object(
    'available',true,'version','player_safe_v1','tenant_id',p_tenant_id,'generated_at',now(),
    'player',jsonb_build_object('player_id',v_p.id,'name',trim(concat_ws(' ',v_p.first_name,v_p.last_name)),'current_club',v_p.current_club,'football_status',v_p.football_status,'contract_status',v_p.contract_status,'contract_expiry',v_p.contract_expiry),
    'primary_staff',v_owner,
    'service_plan',jsonb_build_object('next_action',v_p.next_action,'next_action_due',v_p.next_action_due),
    'career_plan',case when v_strategy.id is null then jsonb_build_object('state','missing') else jsonb_build_object(
      'state',v_strategy.status,'player_confirmation',v_strategy.confirmation_status,'review_due_at',v_strategy.review_due_at,
      'objective',v_strategy.strategy->>'objective','preferred_pathway',v_strategy.strategy->>'preferred_pathway','fallback_pathway',v_strategy.strategy->>'fallback_pathway',
      'next_checkpoint',v_strategy.strategy->>'next_checkpoint','target_window',v_strategy.strategy->'target_window','target_markets',coalesce(v_strategy.strategy->'target_markets','[]'::jsonb)
    ) end,
    'market_activity',coalesce(v_market,jsonb_build_object('active_deals',0,'stages','{}'::jsonb,'market_matches',0,'active_opportunities',0,'club_names_hidden',true)),
    'player_requests',coalesce(v_requests,jsonb_build_object('open',0,'overdue',0)),
    'service_standard',jsonb_build_object('policy_name',v_assurance#>>'{policy,policy_name}','policy_version',v_assurance#>>'{policy,version}','state',coalesce(v_player_assurance->>'state','not_evaluated'),'breaches',coalesce(v_player_assurance->'breaches','[]'::jsonb)),
    'last_recorded_agency_activity_at',v_last,
    'privacy_contract',jsonb_build_object(
      'purpose','Player-facing service transparency without exposing internal negotiation or relationship intelligence.',
      'excluded',jsonb_build_array('fees and commission forecasts','negotiation guardrails','club contact identities','relationship-route intelligence','internal agent notes'),
      'market_names_hidden',true
    ),
    'truth_contract',jsonb_build_object('activity','Only recorded agency activity is shown; offline work that has not been captured cannot appear.','market_activity','Counts are operating records, not promises of transfer or club interest.')
  );
end;
$function$;

create or replace function public.platform_server_representation_records_control(p_tenant_id uuid,p_warning_days integer default 120) returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_days integer:=greatest(30,least(coalesce(p_warning_days,120),365));
  v_items jsonb;
  v_docs jsonb;
  v_total integer;
  v_attention integer;
  v_missing integer;
  v_expiring integer;
begin
  with players as (
    select p.id,p.first_name,p.last_name,p.football_status,
      a.id agreement_id,a.agreement_type,a.status agreement_status,a.start_date,a.end_date,a.document_id,a.title agreement_title,a.updated_at agreement_updated_at
    from public.players p
    left join lateral (
      select pa.* from public.player_agreements pa
      where pa.player_id=p.id and pa.agreement_type in ('representation','mandate') and pa.status in ('active','draft')
      order by case when pa.status='active' then 0 else 1 end,pa.end_date desc nulls last,pa.updated_at desc limit 1
    ) a on true
    where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent')
  ), rows as (
    select p.*,
      case
        when p.agreement_id is null then 'missing_active_representation_record'
        when p.agreement_status='draft' then 'representation_record_draft'
        when p.agreement_status='active' and p.end_date is not null and p.end_date<current_date then 'active_status_past_end_date'
        when p.agreement_status='active' and p.end_date is not null and p.end_date<=current_date+30 then 'expires_within_30_days'
        when p.agreement_status='active' and p.end_date is not null and p.end_date<=current_date+v_days then 'expires_within_warning_window'
        when p.agreement_status='active' and p.document_id is null then 'active_record_without_linked_document'
        when p.agreement_status='active' and p.end_date is null then 'active_record_end_date_not_recorded'
        else 'record_current'
      end state,
      case
        when p.agreement_id is null or (p.agreement_status='active' and p.end_date is not null and p.end_date<current_date) or (p.agreement_status='active' and p.end_date is not null and p.end_date<=current_date+30) then 'high'
        when p.agreement_status='draft' or (p.agreement_status='active' and p.end_date is not null and p.end_date<=current_date+v_days) or (p.agreement_status='active' and p.document_id is null) then 'medium'
        else 'info'
      end attention
    from players p
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id',id,'player_name',trim(concat_ws(' ',first_name,last_name)),'football_status',football_status,
    'state',state,'attention',attention,
    'agreement',case when agreement_id is null then null else jsonb_build_object('agreement_id',agreement_id,'agreement_type',agreement_type,'status',agreement_status,'title',agreement_title,'start_date',start_date,'end_date',end_date,'document_linked',document_id is not null,'updated_at',agreement_updated_at) end,
    'days_to_end',case when end_date is null then null else end_date-current_date end,
    'required_review',case state
      when 'missing_active_representation_record' then 'Confirm whether a current representation/mandate record should exist and record it if appropriate.'
      when 'representation_record_draft' then 'Review the draft representation record and either activate, supersede or discard it.'
      when 'active_status_past_end_date' then 'Review the record because its active status conflicts with the recorded end date.'
      when 'expires_within_30_days' then 'Review representation continuity urgently before the recorded end date.'
      when 'expires_within_warning_window' then 'Plan representation renewal or transition before the recorded end date.'
      when 'active_record_without_linked_document' then 'Link the executed document or confirm why no document is recorded.'
      when 'active_record_end_date_not_recorded' then 'Confirm whether an end date should be recorded.'
      else null end
  ) order by case attention when 'high' then 1 when 'medium' then 2 else 3 end,coalesce(end_date,'9999-12-31'::date),trim(concat_ws(' ',first_name,last_name))),'[]'::jsonb),
  count(*),count(*) filter(where state<>'record_current'),count(*) filter(where state='missing_active_representation_record'),count(*) filter(where state in ('expires_within_30_days','expires_within_warning_window'))
  into v_items,v_total,v_attention,v_missing,v_expiring from rows;

  select coalesce(jsonb_agg(jsonb_build_object('player_id',p.id,'player_name',trim(concat_ws(' ',p.first_name,p.last_name)),'document_id',d.id,'title',d.title,'document_type',d.document_type,'expires_at',d.expires_at,'days_to_expiry',d.expires_at-current_date)
    order by d.expires_at,trim(concat_ws(' ',p.first_name,p.last_name))),'[]'::jsonb)
  into v_docs
  from public.player_documents d join public.players p on p.id=d.player_id
  where p.tenant_id=p_tenant_id and d.expires_at is not null and d.expires_at>=current_date and d.expires_at<=current_date+v_days;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'warning_days',v_days,
    'summary',jsonb_build_object('active_or_free_agent_players',v_total,'records_needing_review',v_attention,'missing_representation_records',v_missing,'representation_records_expiring',v_expiring,'documents_expiring_in_window',jsonb_array_length(v_docs)),
    'players',v_items,'expiring_documents',v_docs,
    'truth_contract',jsonb_build_object(
      'legal','This is factual records control only. It does not determine legal enforceability, regulatory compliance, FIFA agent-rule compliance or entitlement to commission.',
      'agreement_scope','The control looks for recorded active/draft representation or mandate records for active/free-agent players. Different agency structures may legitimately use other arrangements.',
      'documents','Document expiry alerts are informational; the system does not infer that every document is legally required.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_player_service_statement(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_representation_records_control(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_player_service_statement(uuid,uuid) to service_role;
grant execute on function public.platform_server_representation_records_control(uuid,integer) to service_role;;
