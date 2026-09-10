-- DJM Player staging djm_os-function bootstrap — batch 03
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private function bootstrap batches, and djm_os function batches 01-02.
--
-- Exact current-production definitions for djm_os functions 41-60 of 95,
-- ordered by function name + identity arguments.
-- Production body MD5: dc5f4907c30f9e0e02b7241d1ad9dc92
--
-- Body validation is disabled only during bootstrap because later djm_os/public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION djm_os.normalise_team_key(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select nullif(trim(regexp_replace(lower(coalesce(p_name,'')),'[^a-z0-9]+',' ','g')),'');
$function$


CREATE OR REPLACE FUNCTION djm_os.normalize_transfermarkt_enrichment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.transfermarkt_enrichment_status := case lower(coalesce(new.transfermarkt_enrichment_status, 'never'))
    when 'complete' then 'verified'
    when 'partial' then 'review'
    when 'blocked' then 'queued'
    when 'pending' then 'queued'
    else new.transfermarkt_enrichment_status
  end;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.opportunity_event_bridge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_changed jsonb:='{}'::jsonb; v_link djm_os.opportunity_links%rowtype;
begin
  begin
    select * into v_link from djm_os.opportunity_links where opportunity_id=new.id;
    if tg_op='INSERT' then
      v_changed:=jsonb_build_object('stage',new.stage,'club_name',new.club_name,'next_action',new.next_action,'next_action_due',new.next_action_due);
      insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,player_id,club_need_id,payload,source,confidence,occurred_at)
      values('PLAYER_OPPORTUNITY_CREATED',new.owner_id,v_link.person_id,v_link.organisation_id,new.player_id,v_link.club_need_id,v_changed,'player_opportunity',1,now());
    else
      if old.stage is distinct from new.stage then v_changed:=v_changed||jsonb_build_object('stage',new.stage); end if;
      if old.next_action is distinct from new.next_action then v_changed:=v_changed||jsonb_build_object('next_action',new.next_action); end if;
      if old.next_action_due is distinct from new.next_action_due then v_changed:=v_changed||jsonb_build_object('next_action_due',new.next_action_due); end if;
      if old.last_contacted_at is distinct from new.last_contacted_at then v_changed:=v_changed||jsonb_build_object('last_contacted_at',new.last_contacted_at); end if;
      if v_changed<>'{}'::jsonb then
        insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,player_id,club_need_id,payload,source,confidence,occurred_at)
        values('PLAYER_OPPORTUNITY_CHANGED',new.owner_id,v_link.person_id,v_link.organisation_id,new.player_id,v_link.club_need_id,v_changed,'player_opportunity',1,now());
      end if;
    end if;
  exception when others then
    raise warning 'DJM opportunity event bridge skipped for %: %',new.id,sqlerrm;
  end;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.peer_metric_percentile(p_provider text, p_competition text, p_season text, p_role text, p_metric text, p_value numeric, p_higher_is_better boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_n integer:=0; v_below integer:=0; v_equal integer:=0; v_pct numeric;
begin
  if p_value is null or p_metric is null then return jsonb_build_object('percentile',null,'n',0); end if;
  select
    count(*) filter(where djm_os.safe_json_number(p.metrics->>p_metric) is not null),
    count(*) filter(where djm_os.safe_json_number(p.metrics->>p_metric) is not null and ((p_higher_is_better and djm_os.safe_json_number(p.metrics->>p_metric)<p_value) or (not p_higher_is_better and djm_os.safe_json_number(p.metrics->>p_metric)>p_value))),
    count(*) filter(where djm_os.safe_json_number(p.metrics->>p_metric)=p_value)
  into v_n,v_below,v_equal
  from djm_os.provider_peer_stat_snapshots p
  where p.provider=p_provider and p.provider_competition_id=p_competition and p.provider_season_id=p_season
    and coalesce(p.provider_position,'unknown')=p_role and coalesce(p.minutes,0)>=180;
  if v_n<6 then return jsonb_build_object('percentile',null,'n',v_n); end if;
  v_pct:=100.0*(v_below+.5*v_equal)/v_n;
  return jsonb_build_object('percentile',round(v_pct,2),'n',v_n);
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.player_change_bridge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n record; changed jsonb := '{}'::jsonb;
begin
  begin
    if old.primary_position is distinct from new.primary_position then changed:=changed||jsonb_build_object('primary_position',new.primary_position); end if;
    if old.secondary_positions is distinct from new.secondary_positions then changed:=changed||jsonb_build_object('secondary_positions',new.secondary_positions); end if;
    if old.preferred_foot is distinct from new.preferred_foot then changed:=changed||jsonb_build_object('preferred_foot',new.preferred_foot); end if;
    if old.contract_status is distinct from new.contract_status then changed:=changed||jsonb_build_object('contract_status',new.contract_status); end if;
    if old.contract_expiry is distinct from new.contract_expiry then changed:=changed||jsonb_build_object('contract_expiry',new.contract_expiry); end if;
    if old.current_club is distinct from new.current_club then changed:=changed||jsonb_build_object('current_club',new.current_club); end if;
    if old.current_country is distinct from new.current_country then changed:=changed||jsonb_build_object('current_country',new.current_country); end if;
    if old.football_status is distinct from new.football_status then changed:=changed||jsonb_build_object('football_status',new.football_status); end if;
    if changed<>'{}'::jsonb then
      insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at) values('PLAYER_MARKET_DATA_CHANGED',auth.uid(),new.id,changed,'djm_player',1,now());
      for n in select id from djm_os.club_needs where status in ('active','open','confirmed') loop perform djm_os.refresh_need_matches(n.id); end loop;
    end if;
  exception when others then raise warning 'DJM Player bridge skipped for player %: %',new.id,sqlerrm; end;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.position_category_weights(p_position_group text)
 RETURNS TABLE(category text, nominal_weight numeric)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select v.category, v.nominal_weight
  from (values
    ('GK','goalkeeping',55::numeric),('GK','aerial',15),('GK','possession',15),('GK','physical',10),('GK','discipline',5),
    ('CB','defending',30),('CB','aerial',25),('CB','possession',20),('CB','progression',15),('CB','physical',10),
    ('FB_WB','defending',20),('FB_WB','progression',25),('FB_WB','creativity',15),('FB_WB','possession',10),('FB_WB','physical',20),('FB_WB','attacking',10),
    ('DM','defending',20),('DM','possession',25),('DM','progression',25),('DM','creativity',10),('DM','physical',10),('DM','discipline',10),
    ('CM','possession',25),('CM','progression',25),('CM','creativity',20),('CM','attacking',10),('CM','defending',10),('CM','physical',5),('CM','discipline',5),
    ('AM','creativity',30),('AM','attacking',25),('AM','progression',20),('AM','possession',10),('AM','physical',5),('AM','discipline',10),
    ('W','attacking',30),('W','creativity',25),('W','progression',20),('W','physical',15),('W','possession',5),('W','discipline',5),
    ('ST','attacking',50),('ST','creativity',15),('ST','physical',15),('ST','aerial',10),('ST','possession',5),('ST','discipline',5)
  ) as v(position_group, category, nominal_weight)
  where v.position_group = p_position_group;
$function$


CREATE OR REPLACE FUNCTION djm_os.position_matches_player(p_need_position text, p_primary text, p_secondary text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  with values_normalised as (
    select
      lower(trim(coalesce(p_need_position, ''))) as need,
      lower(concat_ws(' ', coalesce(p_primary, ''), array_to_string(coalesce(p_secondary, '{}'), ' '))) as player_roles
  )
  select case
    when need = '' then true
    when need ~ '(^|[^a-z])(gk)([^a-z]|$)' or need like '%goalkeep%' then player_roles ~ '(^|[^a-z])(gk)([^a-z]|$)' or player_roles like '%goalkeep%'
    when need ~ 'defensive mid|holding mid|(^|[^a-z])(cdm|dm|6)([^a-z]|$)' then player_roles ~ 'defensive mid|holding mid|(^|[^a-z])(cdm|dm|6)([^a-z]|$)'
    when need ~ 'attacking mid|(^|[^a-z])(cam|am|10)([^a-z]|$)' then player_roles ~ 'attacking mid|(^|[^a-z])(cam|am|10)([^a-z]|$)'
    when need ~ 'central mid|centre mid|box.to.box|(^|[^a-z])(cm|rcm|lcm|8)([^a-z]|$)' then player_roles ~ 'central mid|centre mid|box.to.box|(^|[^a-z])(cm|rcm|lcm|8)([^a-z]|$)'
    when need ~ 'left wing.back|(^|[^a-z])(lwb)([^a-z]|$)' then player_roles ~ 'left wing.back|(^|[^a-z])(lwb)([^a-z]|$)'
    when need ~ 'right wing.back|(^|[^a-z])(rwb)([^a-z]|$)' then player_roles ~ 'right wing.back|(^|[^a-z])(rwb)([^a-z]|$)'
    when need ~ 'left back|(^|[^a-z])(lb)([^a-z]|$)' then player_roles ~ 'left back|(^|[^a-z])(lb)([^a-z]|$)'
    when need ~ 'right back|(^|[^a-z])(rb)([^a-z]|$)' then player_roles ~ 'right back|(^|[^a-z])(rb)([^a-z]|$)'
    when need ~ 'centre back|center back|central defend|(^|[^a-z])(cb|lcb|rcb)([^a-z]|$)' then player_roles ~ 'centre back|center back|central defend|(^|[^a-z])(cb|lcb|rcb)([^a-z]|$)'
    when need ~ 'left wing|left winger|(^|[^a-z])(lw)([^a-z]|$)' then player_roles ~ 'left wing|left winger|(^|[^a-z])(lw)([^a-z]|$)'
    when need ~ 'right wing|right winger|(^|[^a-z])(rw)([^a-z]|$)' then player_roles ~ 'right wing|right winger|(^|[^a-z])(rw)([^a-z]|$)'
    when need ~ 'winger|wide forward' then player_roles ~ 'winger|wide forward|left wing|right wing|(^|[^a-z])(lw|rw)([^a-z]|$)'
    when need ~ 'striker|centre forward|center forward|(^|[^a-z])(st|cf|9)([^a-z]|$)' then player_roles ~ 'striker|centre forward|center forward|forward|(^|[^a-z])(st|cf|9)([^a-z]|$)'
    else player_roles like '%' || need || '%'
  end
  from values_normalised;
$function$


CREATE OR REPLACE FUNCTION djm_os.position_metric_weights(p_role text)
 RETURNS TABLE(metric_key text, nominal_weight numeric, higher_is_better boolean)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
select w.metric_key,w.nominal_weight,w.higher_is_better from (
  values
    ('attacker','goals90',24::numeric,true),('attacker','xg90',14::numeric,true),('attacker','assists90',10::numeric,true),('attacker','xa90',10::numeric,true),('attacker','keyPasses90',8::numeric,true),('attacker','progressiveCarries90',8::numeric,true),('attacker','rating',10::numeric,true),('attacker','sprints90',6::numeric,true),('attacker','topSpeedMax',4::numeric,true),('attacker','passAccuracy',3::numeric,true),('attacker','aerialWinRate',3::numeric,true),
    ('midfielder','rating',12::numeric,true),('midfielder','assists90',10::numeric,true),('midfielder','xa90',10::numeric,true),('midfielder','keyPasses90',14::numeric,true),('midfielder','progressivePasses90',16::numeric,true),('midfielder','progressiveCarries90',10::numeric,true),('midfielder','passes90',8::numeric,true),('midfielder','passAccuracy',8::numeric,true),('midfielder','tackles90',5::numeric,true),('midfielder','interceptions90',5::numeric,true),('midfielder','goals90',2::numeric,true),
    ('defender','rating',12::numeric,true),('defender','interceptions90',18::numeric,true),('defender','tackles90',16::numeric,true),('defender','aerialWinRate',15::numeric,true),('defender','progressivePasses90',12::numeric,true),('defender','passes90',8::numeric,true),('defender','passAccuracy',8::numeric,true),('defender','progressiveCarries90',4::numeric,true),('defender','assists90',3::numeric,true),('defender','goals90',2::numeric,true),('defender','topSpeedMax',2::numeric,true),
    ('goalkeeper','savePercentage',24::numeric,true),('goalkeeper','goalsPrevented90',18::numeric,true),('goalkeeper','rating',18::numeric,true),('goalkeeper','cleanSheetRate',10::numeric,true),('goalkeeper','goalsConceded90',10::numeric,false),('goalkeeper','passAccuracy',8::numeric,true),('goalkeeper','passes90',5::numeric,true),('goalkeeper','longPassAccuracy',7::numeric,true)
) as w(role_name,metric_key,nominal_weight,higher_is_better)
where w.role_name=lower(coalesce(p_role,''));
$function$


CREATE OR REPLACE FUNCTION djm_os.process_message_rule_based(p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m djm_os.messages%rowtype; t djm_os.conversation_threads%rowtype; v_text text; v_position text; v_need uuid; v_task uuid; v_review uuid;
begin
 select * into m from djm_os.messages where id=p_message_id; if not found then return jsonb_build_object('processed',false); end if;
 select * into t from djm_os.conversation_threads where id=m.thread_id; if not found then return jsonb_build_object('processed',false); end if;
 v_text:=trim(coalesce(m.transcript_text,m.raw_text,''));
 if v_text='' then update djm_os.messages set processing_status='stored' where id=m.id; return jsonb_build_object('processed',true,'text',false); end if;
 v_position:=djm_os.normalise_need_position(v_text);
 select id into v_need from djm_os.club_needs where source_message_id=m.id limit 1;
 if v_need is null and lower(m.direction) in ('incoming','inbound','received') and v_position is not null and v_text ~* '\m(need|looking|searching|want|require|after|looking for)\M' then
   if t.organisation_id is not null then
     insert into djm_os.club_needs(organisation_id,source_person_id,owner_user_id,title,position,profile_notes,status,confidence,confirmed_at,expires_at,source_message_id)
     values(t.organisation_id,t.person_id,t.owner_user_id,v_position||' requirement',v_position,left(v_text,1000),'active',0.74,m.sent_at,m.sent_at+interval '45 days',m.id)
     on conflict (source_message_id) where source_message_id is not null do update set organisation_id=excluded.organisation_id,source_person_id=excluded.source_person_id,owner_user_id=excluded.owner_user_id,position=excluded.position,profile_notes=excluded.profile_notes,updated_at=now()
     returning id into v_need;
     update djm_os.review_items set status='resolved',resolved_at=now() where review_type='need_missing_club' and payload->>'message_id'=m.id::text and status='open';
   else
     insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,confidence,payload,status)
     select t.owner_user_id,'need_missing_club','Club need detected but club is unknown','Link this WhatsApp thread to a club to activate the need.',t.person_id,0.74,jsonb_build_object('message_id',m.id,'thread_id',t.id,'position',v_position,'text',left(v_text,1000)),'open'
     where not exists(select 1 from djm_os.review_items r where r.review_type='need_missing_club' and r.payload->>'message_id'=m.id::text and r.status='open')
     returning id into v_review;
   end if;
 end if;
 select id into v_task from djm_os.tasks where source_message_id=m.id and task_type='commitment' limit 1;
 if v_task is null and lower(m.direction) in ('outgoing','outbound','sent') and v_text ~* '\m(i.ll|i will|we.ll|we will|i can|we can)\M' and v_text ~* '\m(send|call|speak|follow up|revert|get back|come back|check|ask)\M' then
   insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,due_at,status,priority,source,source_message_id)
   values(case when v_text ~* '\msend\M' then 'Follow through on promised send' when v_text ~* '\m(call|speak)\M' then 'Follow through on promised call' else 'Follow through on WhatsApp commitment' end,'commitment',t.owner_user_id,t.person_id,t.organisation_id,null,'open',5,'whatsapp_message',m.id)
   on conflict (source_message_id) where source_message_id is not null and task_type='commitment' do update set person_id=excluded.person_id,organisation_id=excluded.organisation_id,owner_user_id=excluded.owner_user_id,updated_at=now()
   returning id into v_task;
 elsif v_task is not null then
   update djm_os.tasks set person_id=coalesce(t.person_id,person_id),organisation_id=coalesce(t.organisation_id,organisation_id),updated_at=now() where id=v_task;
 end if;
 if t.person_id is null then
   insert into djm_os.review_items(owner_user_id,review_type,title,detail,confidence,payload,status)
   select t.owner_user_id,'thread_identity','Identify WhatsApp contact',coalesce(t.thread_label,'Unknown WhatsApp thread'),0.5,jsonb_build_object('thread_id',t.id),'open'
   where not exists(select 1 from djm_os.review_items r where r.review_type='thread_identity' and r.payload->>'thread_id'=t.id::text and r.status='open') returning id into v_review;
 end if;
 insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
 select 'MESSAGE_PROCESSED',t.owner_user_id,t.person_id,t.organisation_id,jsonb_build_object('message_id',m.id,'thread_id',t.id,'position',v_position,'club_need_id',v_need,'task_id',v_task),'whatsapp_message',1,m.sent_at
 where not exists(select 1 from djm_os.events e where e.event_type='MESSAGE_PROCESSED' and e.payload->>'message_id'=m.id::text and e.organisation_id is not distinct from t.organisation_id);
 update djm_os.messages set processing_status='processed',extracted_json=coalesce(extracted_json,'{}'::jsonb)||jsonb_build_object('position',v_position,'club_need_id',v_need,'task_id',v_task) where id=m.id;
 perform djm_os.thread_interaction_rollup(t.id);
 return jsonb_build_object('processed',true,'position',v_position,'club_need_id',v_need,'task_id',v_task,'review_id',v_review);
end $function$


CREATE OR REPLACE FUNCTION djm_os.queue_change_review_items()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v integer:=0; begin
  insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,organisation_id,confidence,payload,status)
  select coalesce((select r.team_member_id from djm_os.relationships r where r.person_id=case when c.entity_type='person' then c.entity_id else null end order by r.strength_score desc nulls last limit 1),null),
         'entity_change',
         case when c.entity_type='person' then 'Possible contact change' else 'Possible data change' end,
         c.change_type||' detected from '||coalesce(c.source_name,'external source'),
         case when c.entity_type='person' then c.entity_id else null end,
         case when c.entity_type='organisation' then c.entity_id else null end,
         c.confidence,
         jsonb_build_object('change_observation_id',c.id,'previous',c.previous_value,'observed',c.observed_value,'source_uri',c.source_uri),
         'open'
  from djm_os.change_observations c
  where c.status='pending' and c.confidence<0.95 and not exists(select 1 from djm_os.review_items r where r.review_type='entity_change' and r.payload->>'change_observation_id'=c.id::text and r.status='open');
  get diagnostics v=row_count;
  return jsonb_build_object('review_items',v);
end; $function$


CREATE OR REPLACE FUNCTION djm_os.queue_transfermarkt_refresh_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.linked_player_id is null and new.transfermarkt_url is not null and btrim(new.transfermarkt_url)<>'' and (tg_op='INSERT' or old.transfermarkt_url is distinct from new.transfermarkt_url) then
    insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,status,reason,next_check_at,source_hint,attempts,updated_at)
    values('recruitment_target',new.id,'transfermarkt_profile',95,'pending','Transfermarkt URL added or changed',now(),new.transfermarkt_url,0,now())
    on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,95),status='pending',reason=excluded.reason,next_check_at=now(),source_hint=excluded.source_hint,locked_at=null,completed_at=null,updated_at=now();
    new.transfermarkt_enrichment_status:='queued';
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION djm_os.recalculate_relationship_scores(p_person_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count int:=0;
begin
  with scored as (
    select r.team_member_id,r.person_id,
      least(100,greatest(1,
        15
        + least(35,coalesce((select count(*) from djm_os.interactions i where i.person_id=r.person_id and i.team_member_id=r.team_member_id and i.occurred_at>now()-interval '180 days'),0)*4)
        + case when r.last_meaningful_at is null then 0 when r.last_meaningful_at>now()-interval '14 days' then 25 when r.last_meaningful_at>now()-interval '45 days' then 18 when r.last_meaningful_at>now()-interval '90 days' then 10 else 3 end
        + least(15,coalesce(r.trust_score,0))
        + least(10,coalesce(r.access_score,0))
      ))::smallint as new_score
    from djm_os.relationships r
    where p_person_id is null or r.person_id=p_person_id
  ), updated as (
    update djm_os.relationships r set strength_score=s.new_score,updated_at=now()
    from scored s where r.team_member_id=s.team_member_id and r.person_id=s.person_id and r.strength_score is distinct from s.new_score
    returning 1
  ) select count(*) into v_count from updated;
  return v_count;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.recover_stale_enrichment_locks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v int; begin update djm_os.freshness_queue set status='queued',locked_at=null,next_check_at=now(),updated_at=now() where status='processing' and locked_at<now()-interval '45 minutes'; get diagnostics v=row_count; return v; end $function$


CREATE OR REPLACE FUNCTION djm_os.refresh_football_subject_enrichment_queue(p_subject_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sc djm_os.football_subject_scorecards%rowtype; v_missing jsonb;
begin
  select * into sc from djm_os.football_subject_scorecards where subject_id=p_subject_id;
  if not found then return; end if;
  v_missing:=coalesce(sc.missing_inputs,sc.basis->'missing_inputs','[]'::jsonb);
  if coalesce(sc.confidence,0) >= 80 then
    insert into djm_os.football_intelligence_enrichment_queue(subject_id,target_confidence,current_confidence,status,missing_evidence,next_attempt_at,updated_at)
    values(p_subject_id,80,coalesce(sc.confidence,0),'ready',v_missing,now()+interval '7 days',now())
    on conflict(subject_id) do update set current_confidence=excluded.current_confidence,status='ready',missing_evidence=excluded.missing_evidence,next_attempt_at=excluded.next_attempt_at,updated_at=now(),last_error=null;
  else
    insert into djm_os.football_intelligence_enrichment_queue(subject_id,target_confidence,current_confidence,status,missing_evidence,next_attempt_at,updated_at)
    values(p_subject_id,80,coalesce(sc.confidence,0),'queued',v_missing,now(),now())
    on conflict(subject_id) do update set current_confidence=excluded.current_confidence,status=case when djm_os.football_intelligence_enrichment_queue.status='running' then 'running' else 'queued' end,missing_evidence=excluded.missing_evidence,next_attempt_at=least(djm_os.football_intelligence_enrichment_queue.next_attempt_at,now()),updated_at=now();
  end if;
end;$function$


CREATE OR REPLACE FUNCTION djm_os.refresh_football_subject_from_career_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_subject_id uuid;
begin
  v_subject_id := case when tg_op='DELETE' then old.subject_id else new.subject_id end;
  if exists(select 1 from djm_os.football_intelligence_subjects s where s.id=v_subject_id) then
    perform djm_os.refresh_football_subject_scorecard(v_subject_id);
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.refresh_football_subject_from_match_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_subject_id uuid;
begin
  v_subject_id := case when tg_op='DELETE' then old.subject_id else new.subject_id end;
  if exists(select 1 from djm_os.football_intelligence_subjects s where s.id=v_subject_id) then
    perform djm_os.refresh_football_subject_scorecard(v_subject_id);
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.refresh_football_subject_projection(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_subject djm_os.football_intelligence_subjects%rowtype;
  v_score djm_os.football_subject_scorecards%rowtype;
  v_position text;
  v_age numeric;
  v_age_integer integer;
  v_age_prior numeric;
  v_headroom numeric;
  v_current numeric;
  v_y1 numeric;
  v_y3 numeric;
  v_y5 numeric;
  v_ceiling numeric;
  v_confidence integer;
  v_width numeric;
  v_low numeric;
  v_high numeric;
  v_career_depth integer;
  v_source_diversity integer;
  v_fingerprint text;
  v_state text;
  v_projection jsonb;
begin
  select * into v_subject
  from djm_os.football_intelligence_subjects s
  where s.id = p_subject_id;

  if not found then
    return jsonb_build_object('available', false, 'reason', 'subject_not_found');
  end if;

  select * into v_score
  from djm_os.football_subject_scorecards sc
  where sc.subject_id = p_subject_id;

  if v_score.subject_id is null or v_score.display_score is null then
    return jsonb_build_object('available', false, 'reason', 'current_score_unavailable');
  end if;

  if v_subject.date_of_birth is null then
    return jsonb_build_object('available', false, 'reason', 'date_of_birth_required');
  end if;

  v_position := coalesce(nullif(v_score.position_group, 'UNKNOWN'), djm_os.normalise_projection_position(v_subject.primary_position));
  if v_position is null then
    return jsonb_build_object('available', false, 'reason', 'position_group_required');
  end if;

  if coalesce(v_score.basis ->> 'score_state', 'enriching') not in ('usable', 'decision_ready', 'ready', 'elite_evidence')
     or coalesce(v_score.confidence, 0) < 45
     or coalesce(v_score.data_coverage, 0) < 40 then
    return jsonb_build_object(
      'available', false,
      'reason', 'current_score_not_yet_projection_grade',
      'current_score', v_score.display_score,
      'current_confidence', v_score.confidence,
      'data_coverage', v_score.data_coverage,
      'score_state', v_score.basis ->> 'score_state'
    );
  end if;

  v_age := extract(year from age(current_date, v_subject.date_of_birth))
           + extract(month from age(current_date, v_subject.date_of_birth)) / 12.0
           + extract(day from age(current_date, v_subject.date_of_birth)) / 365.25;
  v_age_integer := floor(v_age)::integer;
  v_age_prior := private.djm_potential_age_adjustment(v_age_integer, v_position);
  v_current := v_score.display_score::numeric;

  -- This is deliberately a conservative development prior, not a trained success model.
  -- Positive headroom is damped into the expected path. Post-peak priors model decline.
  v_headroom := case
    when v_age_prior > 0 then least(10::numeric, v_age_prior)
    when v_age_prior = 0 then 1.25
    else greatest(-12::numeric, v_age_prior * 0.65)
  end;

  v_y1 := greatest(0, least(100, v_current + v_headroom * 0.375));
  v_y3 := greatest(0, least(100, v_current + v_headroom * 0.65));
  v_y5 := greatest(0, least(100, v_current + v_headroom * 0.75));
  v_ceiling := greatest(
    v_current,
    least(100, v_current + case when v_headroom > 0 then v_headroom * 2.45 else 2 end)
  );

  select count(*)::integer into v_career_depth
  from djm_os.football_subject_career_entries ce
  where ce.subject_id = p_subject_id;

  select count(distinct provider)::integer into v_source_diversity
  from djm_os.football_subject_provider_snapshots ps
  where ps.subject_id = p_subject_id;

  v_confidence := round(least(
    85::numeric,
    greatest(
      20::numeric,
      coalesce(v_score.confidence,0) * 0.58
      + coalesce(v_score.data_coverage,0) * 0.22
      + least(v_career_depth, 5) * 2
      + least(v_source_diversity, 3) * 1.5
    )
  ))::integer;

  v_width := greatest(6::numeric, least(18::numeric, 18 - v_confidence * 0.12));
  v_low := greatest(0, v_y5 - v_width);
  v_high := least(100, v_y5 + v_width);
  v_state := case
    when v_confidence >= 70 then 'decision_support'
    when v_confidence >= 50 then 'directional'
    else 'early_prior'
  end;

  v_fingerprint := md5(concat_ws('|',
    p_subject_id::text,
    v_score.model_version,
    v_score.display_score::text,
    v_score.confidence::text,
    v_score.data_coverage::text,
    v_score.calculated_at::text,
    v_subject.date_of_birth::text,
    v_position,
    v_career_depth::text,
    v_source_diversity::text
  ));

  insert into djm_os.football_subject_projection_snapshots (
    subject_id, as_of_date, horizon_years, current_score,
    forecast_y1, forecast_y3, forecast_y5, ceiling_score,
    lower_bound_score, upper_bound_score, confidence, projection_state,
    position_group, age_years, career_history_depth,
    drivers, input_summary, model_version, methodology_version,
    input_fingerprint, calculated_at, updated_at
  ) values (
    p_subject_id, current_date, 5, v_current,
    round(v_y1,2), round(v_y3,2), round(v_y5,2), round(v_ceiling,2),
    round(v_low,2), round(v_high,2), v_confidence, v_state,
    v_position, round(v_age,2), v_career_depth,
    jsonb_build_object(
      'age_position_headroom', round(v_headroom,2),
      'age_position_prior', round(v_age_prior,2),
      'source_diversity', v_source_diversity,
      'trajectory', jsonb_build_array(
        jsonb_build_object('year',0,'score',round(v_current,2)),
        jsonb_build_object('year',1,'score',round(v_y1,2)),
        jsonb_build_object('year',3,'score',round(v_y3,2)),
        jsonb_build_object('year',5,'score',round(v_y5,2))
      ),
      'interpretation', 'Expected development path under a conservative position-and-age prior. Ceiling is an upside scenario, not a promise.'
    ),
    jsonb_build_object(
      'current_model_version', v_score.model_version,
      'current_score', v_score.display_score,
      'evidence_confidence', v_score.confidence,
      'data_coverage', v_score.data_coverage,
      'evidence_grade', v_score.basis ->> 'evidence_grade',
      'age', round(v_age,2),
      'position_group', v_position,
      'career_history_depth', v_career_depth,
      'independent_provider_count', v_source_diversity
    ),
    'djm_projection_prior_v1',
    'age_position_uncertainty_prior_v1',
    v_fingerprint,
    now(), now()
  )
  on conflict (subject_id, as_of_date, horizon_years, model_version)
  do update set
    current_score = excluded.current_score,
    forecast_y1 = excluded.forecast_y1,
    forecast_y3 = excluded.forecast_y3,
    forecast_y5 = excluded.forecast_y5,
    ceiling_score = excluded.ceiling_score,
    lower_bound_score = excluded.lower_bound_score,
    upper_bound_score = excluded.upper_bound_score,
    confidence = excluded.confidence,
    projection_state = excluded.projection_state,
    position_group = excluded.position_group,
    age_years = excluded.age_years,
    career_history_depth = excluded.career_history_depth,
    drivers = excluded.drivers,
    input_summary = excluded.input_summary,
    methodology_version = excluded.methodology_version,
    input_fingerprint = excluded.input_fingerprint,
    calculated_at = excluded.calculated_at,
    updated_at = now();

  select jsonb_build_object(
    'available', true,
    'subject_id', p_subject_id,
    'current_score', round(v_current,2),
    'forecast_score', round(v_y5,2),
    'forecast_y1', round(v_y1,2),
    'forecast_y3', round(v_y3,2),
    'forecast_y5', round(v_y5,2),
    'ceiling_score', round(v_ceiling,2),
    'range_low', round(v_low,2),
    'range_high', round(v_high,2),
    'confidence', v_confidence,
    'projection_state', v_state,
    'age', round(v_age,2),
    'position_group', v_position,
    'career_history_depth', v_career_depth,
    'model_version', 'djm_projection_prior_v1',
    'methodology_version', 'age_position_uncertainty_prior_v1',
    'input_fingerprint', v_fingerprint,
    'trajectory', jsonb_build_array(
      jsonb_build_object('year',0,'score',round(v_current,2)),
      jsonb_build_object('year',1,'score',round(v_y1,2)),
      jsonb_build_object('year',3,'score',round(v_y3,2)),
      jsonb_build_object('year',5,'score',round(v_y5,2))
    ),
    'calibrated_probability', false,
    'training_state', 'research_prior_until_longitudinal_outcomes_are_sufficient'
  ) into v_projection;

  return v_projection;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.refresh_football_subject_score_from_provider_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_subject_id uuid;
begin
  v_subject_id := case when tg_op='DELETE' then old.subject_id else new.subject_id end;
  if exists(select 1 from djm_os.football_intelligence_subjects s where s.id=v_subject_id) then
    perform djm_os.refresh_football_subject_scorecard(v_subject_id);
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.refresh_football_subject_scorecard(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  base jsonb; s djm_os.football_intelligence_subjects%rowtype; sc djm_os.football_subject_scorecards%rowtype; snap djm_os.football_subject_provider_snapshots%rowtype;
  teamctx jsonb; prodctx jsonb; matchctx jsonb; careerctx jsonb; kernel jsonb; components jsonb; missing jsonb:='[]'::jsonb;
  v_country text; v_comp numeric; v_comp_q numeric:=0; v_team numeric; v_team_q numeric:=0; v_role numeric; v_role_q numeric:=0; v_prod numeric; v_prod_q numeric:=0;
  v_match numeric; v_match_q numeric:=0; v_market numeric; v_market_q numeric:=0; v_career numeric; v_career_q numeric:=0; v_identity_q numeric:=0; v_season_q numeric:=0;
  v_minutes numeric:=0; v_apps numeric:=0; v_score integer; v_conf integer; v_coverage integer; v_grade text; v_state text; v_model_score smallint; v_provisional smallint;
  v_team_eligible boolean:=false; v_prod_eligible boolean:=false; v_match_eligible boolean:=false; v_market_eligible boolean:=false; v_career_eligible boolean:=false;
begin
  base:=djm_os.refresh_football_subject_scorecard_v6_core(p_subject_id);
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id; if not found then raise exception 'Football intelligence subject not found'; end if;
  select * into sc from djm_os.football_subject_scorecards where subject_id=p_subject_id; if not found then raise exception 'Football subject scorecard not initialised'; end if;
  v_comp:=djm_os.safe_json_number(sc.basis->>'competition_level_score'); v_role:=djm_os.safe_json_number(sc.basis->>'role_score'); v_minutes:=coalesce(djm_os.safe_json_number(sc.basis->>'minutes'),0); v_apps:=coalesce(djm_os.safe_json_number(sc.basis->>'appearances'),0); v_country:=s.current_country;
  if s.current_competition_id is not null then select coalesce(v_country,c.country) into v_country from djm_os.competitions c where c.id=s.current_competition_id; end if;
  v_comp_q:=case when v_comp is null then 0 else djm_os.global_country_strength_quality(v_country) end;
  select * into snap from djm_os.football_subject_provider_snapshots x where x.subject_id=p_subject_id order by case x.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'api_football' then 3 when 'thesportsdb' then 4 else 9 end,x.observed_at desc nulls last,x.updated_at desc limit 1;
  v_identity_q:=djm_os.subject_identity_quality(p_subject_id);
  if snap.id is not null then v_season_q:=djm_os.global_subject_season_quality(p_subject_id,snap.provider_season_id); if nullif(snap.provider_player_id,'') is not null then v_identity_q:=greatest(v_identity_q,greatest(0,least(1,coalesce(snap.confidence,.75)))*greatest(.50,v_season_q)); end if; end if;
  if v_role is not null and v_minutes>0 then v_role_q:=private.djm_v5_role_quality(v_minutes,v_apps)*greatest(.15,v_season_q); end if;
  teamctx:=djm_os.subject_team_context(p_subject_id); v_team:=djm_os.safe_json_number(teamctx->>'score'); v_team_q:=coalesce(djm_os.safe_json_number(teamctx->>'quality'),0); v_team_eligible:=v_team is not null;
  prodctx:=djm_os.subject_position_production(p_subject_id); v_prod:=djm_os.safe_json_number(prodctx->>'score'); v_prod_q:=coalesce(djm_os.safe_json_number(prodctx->>'quality'),0); v_prod_eligible:=v_prod is not null;
  matchctx:=djm_os.subject_match_influence(p_subject_id); v_match:=djm_os.safe_json_number(matchctx->>'score'); v_match_q:=coalesce(djm_os.safe_json_number(matchctx->>'quality'),0); v_match_eligible:=v_match is not null;
  v_market:=djm_os.market_consensus_score(s.transfermarkt_market_value,s.transfermarkt_market_value_currency); v_market_q:=djm_os.market_value_quality(s.transfermarkt_value_verified_at,s.transfermarkt_market_value,s.transfermarkt_market_value_currency)*.90; v_market_eligible:=v_market is not null;
  careerctx:=djm_os.subject_career_context(p_subject_id); v_career:=djm_os.safe_json_number(careerctx->>'score'); v_career_q:=coalesce(djm_os.safe_json_number(careerctx->>'quality'),0); v_career_eligible:=v_career is not null;
  components:=jsonb_build_object(
    'competition',jsonb_build_object('score',v_comp,'quality',v_comp_q,'weight',20,'eligible',true),
    'team_context',jsonb_build_object('score',v_team,'quality',v_team_q,'weight',10,'eligible',v_team_eligible),
    'role',jsonb_build_object('score',v_role,'quality',v_role_q,'weight',18,'eligible',true),
    'position_production',jsonb_build_object('score',v_prod,'quality',v_prod_q,'weight',20,'eligible',v_prod_eligible),
    'match_influence',jsonb_build_object('score',v_match,'quality',v_match_q,'weight',12,'eligible',v_match_eligible),
    'market_consensus',jsonb_build_object('score',v_market,'quality',v_market_q,'weight',12,'eligible',v_market_eligible),
    'career_context',jsonb_build_object('score',v_career,'quality',v_career_q,'weight',8,'eligible',v_career_eligible));
  kernel:=djm_os.global_score_kernel_v7(components,v_identity_q); v_score:=round((kernel->>'score')::numeric)::int; v_conf:=(kernel->>'confidence')::int; v_coverage:=(kernel->>'data_coverage')::int; v_grade:=kernel->>'evidence_grade'; v_state:=kernel->>'score_state'; v_model_score:=case when v_conf>=80 then v_score::smallint else null end; v_provisional:=case when v_conf<80 then v_score::smallint else null end;
  if v_comp is null then missing:=missing||jsonb_build_array('competition_strength'); end if; if v_role is null then missing:=missing||jsonb_build_array('role_minutes'); end if; if v_prod is null then missing:=missing||jsonb_build_array('position_specific_peer_production'); end if; if v_match is null then missing:=missing||jsonb_build_array('match_influence'); end if; if v_market is null then missing:=missing||jsonb_build_array('market_consensus'); end if; if v_career is null then missing:=missing||jsonb_build_array('verified_career_context'); end if; if v_identity_q<.75 then missing:=missing||jsonb_build_array('verified_identity'); end if;
  update djm_os.football_subject_scorecards set display_score=v_score::smallint,model_score=v_model_score,provisional_score=v_provisional,score_tier=case when v_conf>=80 then 'global' else 'provisional' end,confidence=v_conf::smallint,data_coverage=v_coverage::smallint,position_group=private.djm_position_group(s.primary_position),basis=coalesce(sc.basis,'{}'::jsonb)||jsonb_build_object('model','DJM Global Score V7.1','model_version','djm_global_score_v7_1_diversity_calibrated','definition','Global current-level score using competition strength, selection role, position-specific peer production and optional team, match, market and career evidence. Confidence is capped by independent source diversity, not inflated by missing optional sources.','kernel',kernel,'components',components,'team_context',teamctx,'position_production',prodctx,'match_influence',matchctx,'career_context',careerctx,'market_consensus_score',case when v_market is null then null else round(v_market,2) end,'market_consensus_quality',round(v_market_q,3),'market_consensus_rule','Transfermarkt value is a capped market-consensus signal. Published research shows age, playing position, team and league affect market value, so it cannot replace football evidence.','market_bias_guard','Market quality is discounted by 10 percent until DJM has enough cross-sectional market data to calibrate age- and position-neutral residual value empirically.','identity_quality',round(v_identity_q,3),'season_recency_quality',round(v_season_q,3),'score_state',v_state,'evidence_grade',v_grade,'confidence',v_conf,'data_coverage',v_coverage,'evidence_band',kernel->'evidence_band','age_used_directly_in_current_score',false,'advanced_data_required',false,'missing_inputs',missing,'input_fingerprint',md5(jsonb_build_object('model','djm_global_score_v7_1_diversity_calibrated','subject',p_subject_id,'components',components,'identity_quality',v_identity_q)::text)),missing_inputs=missing,model_version='djm_global_score_v7_1_diversity_calibrated',calculated_at=now(),provenance=coalesce(sc.provenance,'{}'::jsonb)||jsonb_build_object('source','global_subject_v7_1','subject_id',p_subject_id,'score_state',v_state,'market_used',v_market is not null,'match_influence_used',v_match is not null,'position_production_used',v_prod is not null),updated_at=now() where subject_id=p_subject_id;
  perform djm_os.refresh_football_subject_enrichment_queue(p_subject_id);
  return jsonb_build_object('subject_id',p_subject_id,'display_score',v_score,'confidence',v_conf,'data_coverage',v_coverage,'evidence_grade',v_grade,'score_state',v_state,'model_version','djm_global_score_v7_1_diversity_calibrated','components',components,'missing_inputs',missing);
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.refresh_football_subject_scorecard_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform djm_os.refresh_football_subject_scorecard(coalesce(new.id,old.id));
  return coalesce(new,old);
end;
$function$


commit;
