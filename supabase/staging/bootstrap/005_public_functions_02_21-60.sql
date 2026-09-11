-- DJM Player staging public-function bootstrap — batch 02
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private/djm_os function batches, and public function batch 01.
--
-- Exact current-production definitions for public functions 21-60 of 240,
-- ordered by function name + identity arguments.
-- Production body MD5: 64eea1a34f50a5c4c497b31047f8932e
--
-- Existing staging public platform_server_* RPCs were checked for collisions
-- before public bootstrap recovery; no exact production name/signature
-- collision was found.
--
-- Body validation is disabled only during bootstrap because later public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.djm_deal_room_set_stage(p_deal_room_id uuid, p_stage text, p_probability smallint DEFAULT NULL::smallint, p_outcome_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_status text;begin
 if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
 if p_stage not in ('qualifying','contacted','interest','negotiating','offer','contracting','won','lost','paused') then raise exception 'Invalid deal stage'; end if;
 v_status:=case when p_stage='won' then 'won' when p_stage='lost' then 'lost' when p_stage='paused' then 'paused' else 'active' end;
 update djm_os.deal_rooms set stage=p_stage,status=v_status,probability=case when p_stage='won' then 100 when p_stage='lost' then 0 else coalesce(p_probability,probability) end,outcome_reason=coalesce(nullif(trim(p_outcome_reason),''),outcome_reason),last_meaningful_at=now(),updated_at=now() where id=p_deal_room_id;
 return jsonb_build_object('ok',true,'status',v_status);
end $function$


CREATE OR REPLACE FUNCTION public.djm_deal_room_upsert(p_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_organisation_id uuid DEFAULT NULL::uuid, p_source_person_id uuid DEFAULT NULL::uuid, p_player_id uuid DEFAULT NULL::uuid, p_prospect_id uuid DEFAULT NULL::uuid, p_club_need_id uuid DEFAULT NULL::uuid, p_stage text DEFAULT 'qualifying'::text, p_expected_commission numeric DEFAULT NULL::numeric, p_currency text DEFAULT 'EUR'::text, p_probability smallint DEFAULT 25, p_primary_blocker text DEFAULT NULL::text, p_next_decision text DEFAULT NULL::text, p_next_action_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_source text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid; v_owner uuid := (select auth.uid()); v_status text; v_probability smallint;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_stage not in ('qualifying','contacted','interest','negotiating','offer','contracting','won','lost','paused') then raise exception 'Invalid deal stage'; end if;
  v_status:=case when p_stage='won' then 'won' when p_stage='lost' then 'lost' when p_stage='paused' then 'paused' else 'active' end;
  v_probability:=case when p_stage='won' then 100 when p_stage='lost' then 0 else greatest(0,least(100,coalesce(p_probability,25))) end;
  if p_id is null then
    if p_organisation_id is null then raise exception 'Club is required'; end if;
    if num_nonnulls(p_player_id,p_prospect_id) <> 1 then raise exception 'Choose exactly one signed player or recruitment target'; end if;
    insert into djm_os.deal_rooms(title,organisation_id,source_person_id,player_id,prospect_id,club_need_id,owner_user_id,stage,status,expected_commission,currency,probability,primary_blocker,next_decision,next_action_at,last_meaningful_at,source)
    values(coalesce(nullif(trim(p_title),''),'DJM deal'),p_organisation_id,p_source_person_id,p_player_id,p_prospect_id,p_club_need_id,v_owner,p_stage,v_status,p_expected_commission,coalesce(nullif(trim(p_currency),''),'EUR'),v_probability,nullif(trim(p_primary_blocker),''),nullif(trim(p_next_decision),''),p_next_action_at,now(),coalesce(nullif(trim(p_source),''),'manual'))
    returning id into v_id;
  else
    update djm_os.deal_rooms set
      title=coalesce(nullif(trim(p_title),''),title),
      stage=p_stage,
      status=v_status,
      expected_commission=coalesce(p_expected_commission,expected_commission),
      currency=coalesce(nullif(trim(p_currency),''),currency),
      probability=case when p_stage in ('won','lost') then v_probability else greatest(0,least(100,coalesce(p_probability,probability))) end,
      primary_blocker=coalesce(nullif(trim(p_primary_blocker),''),primary_blocker),
      next_decision=coalesce(nullif(trim(p_next_decision),''),next_decision),
      next_action_at=coalesce(p_next_action_at,next_action_at),
      last_meaningful_at=now(),updated_at=now()
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Deal room not found'; end if;
  end if;
  return jsonb_build_object('deal_room_id',v_id,'status',v_status,'probability',v_probability);
end $function$


CREATE OR REPLACE FUNCTION public.djm_deal_rooms(p_status text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, title text, organisation_id uuid, organisation_name text, player_id uuid, prospect_id uuid, player_name text, stage text, status text, expected_commission numeric, currency text, probability smallint, weighted_value numeric, primary_blocker text, next_decision text, next_action_at timestamp with time zone, owner_name text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select d.id,d.title,d.organisation_id,o.name,
 d.player_id,d.prospect_id,
 coalesce(nullif(p.preferred_name,''),trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),sp.full_name) as player_name,
 d.stage,d.status,d.expected_commission,d.currency,d.probability,
 round(coalesce(d.expected_commission,0)*(d.probability::numeric/100),2) as weighted_value,
 d.primary_blocker,d.next_decision,d.next_action_at,tm.display_name,d.updated_at
from djm_os.deal_rooms d
join djm_os.organisations o on o.id=d.organisation_id
left join public.players p on p.id=d.player_id
left join djm_os.scouting_prospects sp on sp.id=d.prospect_id
left join djm_os.team_members tm on tm.user_id=d.owner_user_id
where p_status is null or d.status=p_status
order by case when d.status='active' then 0 else 1 end, d.next_action_at nulls last, weighted_value desc, d.updated_at desc;
$function$


CREATE OR REPLACE FUNCTION public.djm_delete_entity(p_entity_type text, p_entity_id uuid, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_name text; v_linked uuid;
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 if not p_confirm then raise exception 'Deletion requires explicit confirmation'; end if;
 if p_entity_type='club' then select name into v_name from djm_os.organisations where id=p_entity_id; delete from djm_os.organisations where id=p_entity_id;
 elsif p_entity_type='club_contact' then select full_name into v_name from djm_os.people where id=p_entity_id; delete from djm_os.people where id=p_entity_id;
 elsif p_entity_type='recruitment_target' then select full_name,signed_player_id into v_name,v_linked from djm_os.scouting_prospects where id=p_entity_id; if v_linked is not null then raise exception 'This target is linked to a Signed Player. Remove the recruitment link first rather than deleting representation history.'; end if; delete from djm_os.freshness_queue where entity_type='recruitment_target' and entity_id=p_entity_id; delete from djm_os.scouting_prospects where id=p_entity_id;
 elsif p_entity_type='deal_room' then select title into v_name from djm_os.deal_rooms where id=p_entity_id; delete from djm_os.deal_rooms where id=p_entity_id;
 elsif p_entity_type='club_need' then select coalesce(title,position) into v_name from djm_os.club_needs where id=p_entity_id; delete from djm_os.club_needs where id=p_entity_id;
 else raise exception 'Unsupported entity type'; end if;
 insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at) values('ENTITY_DELETED',(select auth.uid()),jsonb_build_object('entity_type',p_entity_type,'deleted_id',p_entity_id,'name',v_name),'manual_delete',1,now());
 return jsonb_build_object('deleted',true,'entity_type',p_entity_type,'id',p_entity_id,'name',v_name);
end $function$


CREATE OR REPLACE FUNCTION public.djm_delete_preview(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 if p_entity_type='club' then return jsonb_build_object('entity_type','club','contacts',(select count(*) from djm_os.employments where organisation_id=p_entity_id),'needs',(select count(*) from djm_os.club_needs where organisation_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where organisation_id=p_entity_id),'interactions',(select count(*) from djm_os.interactions where organisation_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where organisation_id=p_entity_id));
 elsif p_entity_type='club_contact' then return jsonb_build_object('entity_type','club_contact','relationships',(select count(*) from djm_os.relationships where person_id=p_entity_id),'interactions',(select count(*) from djm_os.interactions where person_id=p_entity_id),'employments',(select count(*) from djm_os.employments where person_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where person_id=p_entity_id));
 elsif p_entity_type='recruitment_target' then return jsonb_build_object('entity_type','recruitment_target','interactions',(select count(*) from djm_os.recruitment_interactions where prospect_id=p_entity_id),'reports',(select count(*) from djm_os.scouting_reports where prospect_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where prospect_id=p_entity_id),'signed_player_id',(select signed_player_id from djm_os.scouting_prospects where id=p_entity_id));
 elsif p_entity_type='deal_room' then return jsonb_build_object('entity_type','deal_room','exists',exists(select 1 from djm_os.deal_rooms where id=p_entity_id));
 elsif p_entity_type='club_need' then return jsonb_build_object('entity_type','club_need','matches',(select count(*) from djm_os.player_matches where club_need_id=p_entity_id),'tasks',(select count(*) from djm_os.tasks where club_need_id=p_entity_id),'deals',(select count(*) from djm_os.deal_rooms where club_need_id=p_entity_id));
 else raise exception 'Unsupported entity type'; end if;
end $function$


CREATE OR REPLACE FUNCTION public.djm_disable_calendar_subscription()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  update public.calendar_subscriptions
  set enabled=false,updated_at=now()
  where user_id=uid;

  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_email_delivery_config()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'pg_catalog'
AS $function$
  select jsonb_build_object('enabled',coalesce(enabled,false),'provider',provider,'api_key',api_key,'from_address',from_address)
  from private.djm_email_config where singleton=true limit 1
$function$


CREATE OR REPLACE FUNCTION public.djm_email_delivery_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'pg_catalog'
AS $function$
  select jsonb_build_object('enabled',coalesce(enabled,false) and api_key is not null and from_address is not null,'provider',provider,'from_address',case when from_address is not null then from_address else null end)
  from private.djm_email_config where singleton=true limit 1
$function$


CREATE OR REPLACE FUNCTION public.djm_enrichment_claim(p_limit integer DEFAULT 10)
 RETURNS TABLE(job_id uuid, entity_type text, entity_id uuid, check_type text, priority smallint, reason text, source_hint text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 return query
 with pick as (
   select q.id from djm_os.freshness_queue q
   where q.status in ('queued','due','pending','failed')
     and coalesce(q.next_check_at,now())<=now()
     and (q.locked_at is null or q.locked_at<now()-interval '30 minutes')
   order by q.priority desc,coalesce(q.next_check_at,q.created_at),q.created_at
   for update skip locked
   limit greatest(1,least(coalesce(p_limit,10),50))
 ), upd as (
   update djm_os.freshness_queue q
   set status='processing',locked_at=now(),attempts=q.attempts+1,updated_at=now()
   from pick where q.id=pick.id returning q.*
 )
 select u.id,u.entity_type,u.entity_id,u.check_type,u.priority,u.reason,u.source_hint from upd u;
end $function$


CREATE OR REPLACE FUNCTION public.djm_enrichment_due(p_limit integer DEFAULT 25)
 RETURNS TABLE(job_id uuid, entity_type text, entity_id uuid, entity_name text, check_type text, priority smallint, reason text, source_hint text, last_checked_at timestamp with time zone, next_check_at timestamp with time zone, current_context jsonb)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
select q.id,q.entity_type,q.entity_id,
case
 when q.entity_type='person' then p.full_name
 when q.entity_type='organisation' then o.name
 when q.entity_type='player' then trim(coalesce(pl.preferred_name,concat_ws(' ',pl.first_name,pl.last_name)))
 when q.entity_type='recruitment_target' then sp.full_name
 else q.entity_id::text end,
q.check_type,q.priority,q.reason,q.source_hint,q.last_checked_at,q.next_check_at,
case
 when q.entity_type='person' then jsonb_build_object('linkedin_url',p.linkedin_url,'current_employment',(select jsonb_build_object('club',oo.name,'role',e.role_title,'country',oo.country) from djm_os.employments e join djm_os.organisations oo on oo.id=e.organisation_id where e.person_id=p.id and e.is_current order by e.updated_at desc limit 1))
 when q.entity_type='organisation' then jsonb_build_object('country',o.country,'website_url',o.website_url)
 when q.entity_type='player' then jsonb_build_object('current_club',pl.current_club,'current_country',pl.current_country,'contract_expiry',pl.contract_expiry,'transfermarkt_url',pl.transfermarkt_url,'wyscout_url',pl.wyscout_url)
 when q.entity_type='recruitment_target' then jsonb_build_object(
   'full_name',sp.full_name,
   'date_of_birth',sp.date_of_birth,
   'nationality',sp.nationality,
   'current_club',sp.current_club,
   'current_country',sp.current_country,
   'primary_position',sp.primary_position,
   'secondary_positions',sp.secondary_positions,
   'preferred_foot',sp.preferred_foot,
   'contract_expiry',sp.contract_expiry,
   'market_value',sp.market_value,
   'market_value_currency',sp.market_value_currency,
   'agent_status',sp.agent_status,
   'agent_name',sp.agent_name,
   'transfermarkt_url',sp.transfermarkt_url
 )
 else '{}'::jsonb end
from djm_os.freshness_queue q
left join djm_os.people p on q.entity_type='person' and p.id=q.entity_id
left join djm_os.organisations o on q.entity_type='organisation' and o.id=q.entity_id
left join public.players pl on q.entity_type='player' and pl.id=q.entity_id
left join djm_os.scouting_prospects sp on q.entity_type='recruitment_target' and sp.id=q.entity_id and sp.linked_player_id is null
where q.status in ('queued','due','pending','failed')
  and coalesce(q.next_check_at,now())<=now()
  and exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active)
order by q.priority desc,coalesce(q.next_check_at,q.created_at),q.created_at
limit greatest(1,least(coalesce(p_limit,25),100))
$function$


CREATE OR REPLACE FUNCTION public.djm_enrichment_fail(p_job_id uuid, p_error text, p_retry_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 update djm_os.freshness_queue set status='failed',locked_at=null,next_check_at=now()+make_interval(hours=>greatest(1,least(coalesce(p_retry_hours,24),168))),result_json=coalesce(result_json,'{}'::jsonb)||jsonb_build_object('last_error',left(coalesce(p_error,'Unknown error'),1000),'failed_at',now()),updated_at=now() where id=p_job_id;
 if not found then raise exception 'Enrichment job not found'; end if;
 return jsonb_build_object('job_id',p_job_id,'status','failed','retry_at',(select next_check_at from djm_os.freshness_queue where id=p_job_id));
end $function$


CREATE OR REPLACE FUNCTION public.djm_enrichment_submit(p_job_id uuid, p_observed jsonb, p_source_uri text, p_source_name text, p_confidence numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare q djm_os.freshness_queue%rowtype; v_result jsonb; v_review uuid; v_org djm_os.organisations%rowtype;
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 select * into q from djm_os.freshness_queue where id=p_job_id; if not found then raise exception 'Enrichment job not found'; end if;
 if p_confidence is null or p_confidence<0 or p_confidence>1 then raise exception 'Confidence must be between 0 and 1'; end if;

 if q.entity_type='person' and q.check_type in ('employment','role','contact_employment') and nullif(trim(p_observed->>'club_name'),'') is not null then
   v_result:=public.djm_record_employment_observation(q.entity_id,p_observed->>'club_name',p_observed->>'role_title',p_observed->>'country',p_source_uri,p_source_name,p_confidence);
 elsif q.entity_type='organisation' then
   select * into v_org from djm_os.organisations where id=q.entity_id;
   insert into djm_os.claims(organisation_id,claim_type,claim_key,value_json,confidence,last_verified_at,source_uri,created_at)
   values(q.entity_id,'organisation_verification',q.check_type,coalesce(p_observed,'{}'::jsonb),p_confidence,now(),p_source_uri,now());
   if p_confidence>=0.90 then
     update djm_os.organisations
     set country=coalesce(nullif(trim(p_observed->>'country'),''),country),
         website_url=coalesce(nullif(trim(p_observed->>'website_url'),''),website_url),
         last_verified_at=now(),updated_at=now()
     where id=q.entity_id;
     v_result:=jsonb_build_object('applied',true,'organisation_id',q.entity_id);
   else
     insert into djm_os.review_items(owner_user_id,review_type,title,detail,organisation_id,confidence,payload,status)
     values((select auth.uid()),'organisation_enrichment','Review organisation update','External enrichment returned a lower-confidence organisation update.',q.entity_id,p_confidence,jsonb_build_object('observed',p_observed,'source_uri',p_source_uri,'job_id',q.id),'open') returning id into v_review;
     v_result:=jsonb_build_object('applied',false,'review_id',v_review);
   end if;
 elsif q.entity_type='recruitment_target' and q.check_type='transfermarkt_profile' then
   if p_confidence>=0.90 then
     update djm_os.scouting_prospects sp
     set date_of_birth=coalesce(nullif(p_observed->>'date_of_birth','')::date,sp.date_of_birth),
         nationality=coalesce(nullif(trim(p_observed->>'nationality'),''),sp.nationality),
         current_club=coalesce(nullif(trim(p_observed->>'current_club'),''),sp.current_club),
         current_country=coalesce(nullif(trim(p_observed->>'current_country'),''),sp.current_country),
         primary_position=coalesce(nullif(trim(p_observed->>'primary_position'),''),sp.primary_position),
         preferred_foot=coalesce(nullif(trim(p_observed->>'preferred_foot'),''),sp.preferred_foot),
         contract_expiry=case when p_observed ? 'contract_expiry' then nullif(p_observed->>'contract_expiry','')::date else sp.contract_expiry end,
         market_value=coalesce(nullif(p_observed->>'market_value','')::numeric,sp.market_value),
         market_value_currency=coalesce(nullif(trim(p_observed->>'market_value_currency'),''),sp.market_value_currency),
         agent_status=coalesce(nullif(trim(p_observed->>'agent_status'),''),sp.agent_status),
         agent_name=case when p_observed ? 'agent_name' then nullif(trim(p_observed->>'agent_name'),'') else sp.agent_name end,
         transfermarkt_enrichment_status='complete',
         transfermarkt_checked_at=now(),
         transfermarkt_snapshot=jsonb_build_object('source_url',p_source_uri,'source_name',p_source_name,'observed_at',now(),'fields',p_observed,'confidence',p_confidence,'via','enrichment_worker'),
         market_value_verified_at=case when p_observed ? 'market_value' then now() else sp.market_value_verified_at end,
         source='transfermarkt',source_confidence=p_confidence,last_verified_at=now(),updated_at=now()
     where sp.id=q.entity_id and sp.linked_player_id is null;
     if not found then raise exception 'Recruitment target not found'; end if;
     v_result:=jsonb_build_object('applied',true,'recruitment_target_id',q.entity_id);
   else
     insert into djm_os.review_items(owner_user_id,review_type,title,detail,confidence,payload,status)
     values((select auth.uid()),'external_enrichment','Review Recruitment profile update','Transfermarkt/public-source profile data needs confirmation before it changes the Recruitment target.',p_confidence,jsonb_build_object('entity_type',q.entity_type,'entity_id',q.entity_id,'check_type',q.check_type,'observed',p_observed,'source_uri',p_source_uri,'job_id',q.id),'open') returning id into v_review;
     v_result:=jsonb_build_object('applied',false,'review_id',v_review);
   end if;
 else
   insert into djm_os.review_items(owner_user_id,review_type,title,detail,player_id,confidence,payload,status)
   values((select auth.uid()),'external_enrichment','Review external data update','External enrichment result needs review before application.',case when q.entity_type='player' then q.entity_id else null end,p_confidence,jsonb_build_object('entity_type',q.entity_type,'entity_id',q.entity_id,'check_type',q.check_type,'observed',p_observed,'source_uri',p_source_uri,'job_id',q.id),'open') returning id into v_review;
   v_result:=jsonb_build_object('applied',false,'review_id',v_review);
 end if;

 update djm_os.freshness_queue
 set status='completed',last_checked_at=now(),completed_at=now(),
     result_json=jsonb_build_object('observed',p_observed,'source_uri',p_source_uri,'source_name',p_source_name,'confidence',p_confidence,'result',v_result),
     locked_at=null,updated_at=now()
 where id=q.id;
 return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('job_id',q.id,'completed',true);
end $function$


CREATE OR REPLACE FUNCTION public.djm_entity_link_delete(p_link_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_link djm_os.entity_links%rowtype;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into v_link from djm_os.entity_links where id=p_link_id; if not found then raise exception 'Link not found'; end if;
  delete from djm_os.entity_links where id=p_link_id;
  if v_link.entity_kind='contact' then update djm_os.people set linkedin_url=case when v_link.platform='linkedin' and linkedin_url=v_link.url then null else linkedin_url end,instagram_url=case when v_link.platform='instagram' and instagram_url=v_link.url then null else instagram_url end,updated_at=now() where id=v_link.entity_id;
  elsif v_link.entity_kind='club' then update djm_os.organisations set website_url=case when v_link.platform='website' and website_url=v_link.url then null else website_url end,linkedin_url=case when v_link.platform='linkedin' and linkedin_url=v_link.url then null else linkedin_url end,instagram_url=case when v_link.platform='instagram' and instagram_url=v_link.url then null else instagram_url end,transfermarkt_url=case when v_link.platform='transfermarkt' and transfermarkt_url=v_link.url then null else transfermarkt_url end,updated_at=now() where id=v_link.entity_id;
  elsif v_link.entity_kind='player' then update public.players set transfermarkt_url=case when v_link.platform='transfermarkt' and transfermarkt_url=v_link.url then null else transfermarkt_url end,wyscout_url=case when v_link.platform='wyscout' and wyscout_url=v_link.url then null else wyscout_url end,stats_url=case when v_link.platform in ('stats','sofascore','fotmob','soccerway') and stats_url=v_link.url then null else stats_url end,instagram_url=case when v_link.platform='instagram' and instagram_url=v_link.url then null else instagram_url end,updated_at=now() where id=v_link.entity_id;
  elsif v_link.entity_kind='recruitment' then update djm_os.scouting_prospects set transfermarkt_url=case when v_link.platform='transfermarkt' and transfermarkt_url=v_link.url then null else transfermarkt_url end,wyscout_url=case when v_link.platform='wyscout' and wyscout_url=v_link.url then null else wyscout_url end,video_url=case when v_link.platform in ('video','youtube','vimeo') and video_url=v_link.url then null else video_url end,instagram_url=case when v_link.platform='instagram' and instagram_url=v_link.url then null else instagram_url end,updated_at=now() where id=v_link.entity_id; end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at) values('ENTITY_LINK_REMOVED',auth.uid(),case when v_link.entity_kind='contact' then v_link.entity_id else null end,case when v_link.entity_kind='club' then v_link.entity_id else null end,case when v_link.entity_kind='player' then v_link.entity_id else null end,jsonb_build_object('entity_kind',v_link.entity_kind,'entity_id',v_link.entity_id,'platform',v_link.platform,'label',v_link.label),'manual_ui',1,now());
  return true;
end; $function$


CREATE OR REPLACE FUNCTION public.djm_entity_link_upsert(p_id uuid DEFAULT NULL::uuid, p_entity_kind text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_platform text DEFAULT NULL::text, p_label text DEFAULT NULL::text, p_url text DEFAULT NULL::text, p_sort_order smallint DEFAULT 0, p_is_public boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid; v_kind text := lower(trim(coalesce(p_entity_kind, ''))); v_platform text := lower(trim(coalesce(p_platform, ''))); v_label text := nullif(trim(coalesce(p_label, '')), ''); v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_kind not in ('contact','club','player','recruitment') then raise exception 'Invalid entity kind'; end if;
  if v_platform not in ('linkedin','instagram','transfermarkt','wyscout','sofascore','fotmob','soccerway','stats','website','youtube','vimeo','x','tiktok','video','other') then raise exception 'Invalid link type'; end if;
  if p_entity_id is null then raise exception 'Entity is required'; end if;
  if v_url is null then raise exception 'URL is required'; end if;
  if v_url !~* '^https?://' then v_url := 'https://' || v_url; end if;
  if v_url !~* '^https?://[^[:space:]]+$' then raise exception 'Enter a valid http or https URL'; end if;
  v_label := coalesce(v_label, initcap(replace(v_platform, '_', ' ')));
  if v_kind='contact' then if not exists(select 1 from djm_os.people where id=p_entity_id) then raise exception 'Contact not found'; end if;
  elsif v_kind='club' then if not exists(select 1 from djm_os.organisations where id=p_entity_id and organisation_type='club') then raise exception 'Club not found'; end if;
  elsif v_kind='player' then if not exists(select 1 from public.players where id=p_entity_id) then raise exception 'Player not found'; end if;
  elsif v_kind='recruitment' then if not exists(select 1 from djm_os.scouting_prospects where id=p_entity_id) then raise exception 'Recruitment target not found'; end if; end if;
  if p_id is not null then
    update djm_os.entity_links set platform=v_platform,label=v_label,url=v_url,sort_order=coalesce(p_sort_order,0),is_public=coalesce(p_is_public,false),updated_at=now() where id=p_id and entity_kind=v_kind and entity_id=p_entity_id returning id into v_id;
    if v_id is null then raise exception 'Link not found'; end if;
  else
    insert into djm_os.entity_links(entity_kind,entity_id,platform,label,url,sort_order,is_public,created_by) values(v_kind,p_entity_id,v_platform,v_label,v_url,coalesce(p_sort_order,0),coalesce(p_is_public,false),auth.uid()) on conflict (entity_kind,entity_id,platform) do update set label=excluded.label,url=excluded.url,sort_order=excluded.sort_order,is_public=excluded.is_public,updated_at=now() returning id into v_id;
  end if;
  if v_kind='contact' then update djm_os.people set linkedin_url=case when v_platform='linkedin' then v_url else linkedin_url end,instagram_url=case when v_platform='instagram' then v_url else instagram_url end,updated_at=now(),last_verified_at=now() where id=p_entity_id;
  elsif v_kind='club' then update djm_os.organisations set website_url=case when v_platform='website' then v_url else website_url end,linkedin_url=case when v_platform='linkedin' then v_url else linkedin_url end,instagram_url=case when v_platform='instagram' then v_url else instagram_url end,transfermarkt_url=case when v_platform='transfermarkt' then v_url else transfermarkt_url end,updated_at=now(),last_verified_at=now() where id=p_entity_id;
  elsif v_kind='player' then update public.players set transfermarkt_url=case when v_platform='transfermarkt' then v_url else transfermarkt_url end,wyscout_url=case when v_platform='wyscout' then v_url else wyscout_url end,stats_url=case when v_platform in ('stats','sofascore','fotmob','soccerway') then v_url else stats_url end,instagram_url=case when v_platform='instagram' then v_url else instagram_url end,updated_at=now() where id=p_entity_id;
  elsif v_kind='recruitment' then update djm_os.scouting_prospects set transfermarkt_url=case when v_platform='transfermarkt' then v_url else transfermarkt_url end,wyscout_url=case when v_platform='wyscout' then v_url else wyscout_url end,video_url=case when v_platform in ('video','youtube','vimeo') then v_url else video_url end,instagram_url=case when v_platform='instagram' then v_url else instagram_url end,updated_at=now(),last_verified_at=now() where id=p_entity_id; end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at) values('ENTITY_LINK_SAVED',auth.uid(),case when v_kind='contact' then p_entity_id else null end,case when v_kind='club' then p_entity_id else null end,case when v_kind='player' then p_entity_id else null end,jsonb_build_object('entity_kind',v_kind,'entity_id',p_entity_id,'platform',v_platform,'label',v_label,'url',v_url),'manual_ui',1,now());
  return jsonb_build_object('id',v_id,'platform',v_platform,'label',v_label,'url',v_url);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_entity_links(p_entity_kind text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_kind text := lower(trim(coalesce(p_entity_kind, '')));
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_kind not in ('contact','club','player','recruitment') then raise exception 'Invalid entity kind'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'entity_kind',l.entity_kind,'entity_id',l.entity_id,'platform',l.platform,'label',l.label,'url',l.url,'sort_order',l.sort_order,'is_public',l.is_public,'updated_at',l.updated_at) order by l.sort_order,l.platform) from djm_os.entity_links l where l.entity_kind=v_kind and l.entity_id=p_entity_id),'[]'::jsonb);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_entity_memories(p_entity_type text, p_entity_id uuid, p_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, memory_type text, statement text, confidence numeric, source_url text, source_kind text, source_label text, observed_at timestamp with time zone, valid_until timestamp with time zone, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select m.id,m.memory_type,m.statement,m.confidence,m.source_url,m.source_kind,m.source_label,m.observed_at,m.valid_until,m.status from djm_os.memories m
where (p_entity_type='person' and m.person_id=p_entity_id) or (p_entity_type='club' and m.organisation_id=p_entity_id) or (p_entity_type='signed_player' and m.player_id=p_entity_id) or (p_entity_type='recruitment_target' and m.prospect_id=p_entity_id) or (p_entity_type='club_need' and m.club_need_id=p_entity_id)
order by m.observed_at desc limit greatest(1,least(coalesce(p_limit,25),100));
$function$


CREATE OR REPLACE FUNCTION public.djm_football_subject_comparison(p_subject_id uuid, p_compare_competition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_subject djm_os.football_intelligence_subjects%rowtype;
  v_score djm_os.football_subject_scorecards%rowtype;
  v_provider djm_os.football_subject_provider_snapshots%rowtype;
  v_role text;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_subject
  from djm_os.football_intelligence_subjects
  where id=p_subject_id;
  if not found then raise exception 'Football intelligence subject not found'; end if;

  select * into v_score
  from djm_os.football_subject_scorecards
  where subject_id=p_subject_id;

  select * into v_provider
  from djm_os.football_subject_provider_snapshots
  where subject_id=p_subject_id
  order by
    case provider when 'pitchapi' then 1 when 'official_league' then 2 when 'wyscout' then 3 when 'api_football' then 4 else 9 end,
    synced_at desc
  limit 1;

  v_role := coalesce(v_provider.metrics #>> '{current_window,role}', v_provider.metrics #>> '{current_season,role}', v_provider.metrics ->> 'role');

  with current_peers as (
    select p.*
    from djm_os.provider_peer_stat_snapshots p
    where v_provider.id is not null
      and p.provider=v_provider.provider
      and p.provider_competition_id=v_provider.provider_competition_id
      and p.provider_season_id=v_provider.provider_season_id
      and p.minutes>=180
      and (v_role is null or p.provider_position=v_role)
    order by p.minutes desc,p.player_name
  ), target_comp as (
    select c.*,
      coalesce(nullif(c.provider_ids->>'pitchapi',''),nullif(c.provider_ids->>'official_league','')) as provider_competition_id,
      case
        when nullif(c.provider_ids->>'pitchapi','') is not null then 'pitchapi'
        when nullif(c.provider_ids->>'official_league','') is not null then 'official_league'
        else null
      end as target_provider
    from djm_os.competitions c
    where c.id=p_compare_competition_id
    limit 1
  ), target_key as (
    select tc.*,
      (select p.provider_season_id from djm_os.provider_peer_stat_snapshots p
       where p.provider=tc.target_provider and p.provider_competition_id=tc.provider_competition_id
       order by p.synced_at desc limit 1) as provider_season_id
    from target_comp tc
  ), target_peers as (
    select p.*
    from djm_os.provider_peer_stat_snapshots p
    join target_key tk on p.provider=tk.target_provider
      and p.provider_competition_id=tk.provider_competition_id
      and p.provider_season_id=tk.provider_season_id
    where p.minutes>=180
      and (v_role is null or p.provider_position=v_role)
    order by p.minutes desc,p.player_name
  )
  select jsonb_build_object(
    'subject',to_jsonb(v_subject),
    'scorecard',case when v_score.subject_id is null then jsonb_build_object(
      'display_score',null,'score_tier','unavailable','confidence',0,
      'reason','No canonical score has been calculated for this subject yet.'
    ) else to_jsonb(v_score) end,
    'provider_snapshot',case when v_provider.id is null then 'null'::jsonb else to_jsonb(v_provider) end,
    'peers',coalesce((select jsonb_agg(to_jsonb(p)) from current_peers p),'[]'::jsonb),
    'target_peers',coalesce((select jsonb_agg(to_jsonb(p)) from target_peers p),'[]'::jsonb),
    'semantics',jsonb_build_object(
      'subject_scope','Signed players and prospects share one persistent football intelligence identity.',
      'score','Signed-player V5 scores are mirrored unchanged. Prospect scores remain unknown until a canonical prospect-capable scorer is available.',
      'peers','Observed provider or verified official-league players only. No synthetic peer rows.',
      'promotion','When a prospect becomes signed, provider identities and evidence remain attached to the same subject.'
    )
  ) into v_result;

  return v_result;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_football_subject_score_v6(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return djm_os.refresh_football_subject_scorecard(p_subject_id);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_football_subject_scores()
 RETURNS TABLE(subject_id uuid, player_id uuid, prospect_id uuid, representation_status text, display_score smallint, score_tier text, confidence smallint, data_coverage smallint, provisional_grade text, model_version text, calculated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  return query
  select
    s.id,
    s.player_id,
    s.prospect_id,
    s.representation_status,
    sc.display_score,
    sc.score_tier,
    sc.confidence,
    sc.data_coverage,
    sc.basis ->> 'provisional_grade',
    sc.model_version,
    sc.calculated_at
  from djm_os.football_intelligence_subjects s
  join djm_os.football_subject_scorecards sc on sc.subject_id=s.id
  order by s.updated_at desc;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_founder_home()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select jsonb_build_object(
 'today',public.djm_today(),
 'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.djm_notifications(12))x),'[]'::jsonb),
 'review',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.djm_review_queue(12))x),'[]'::jsonb),
 'meetings',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (select * from public.djm_network_meetings('mine',now(),now()+interval '7 days') limit 10)x),'[]'::jsonb),
 'metrics',public.djm_team_metrics(30),
 'automation',public.djm_automation_health()
 ); $function$


CREATE OR REPLACE FUNCTION public.djm_get_calendar_subscription()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  uid uuid := auth.uid();
  row_data public.calendar_subscriptions;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  insert into public.calendar_subscriptions(user_id)
  values(uid)
  on conflict(user_id) do update
    set enabled=true,
        updated_at=now()
  returning * into row_data;

  return jsonb_build_object(
    'token', row_data.token,
    'enabled', row_data.enabled,
    'updated_at', row_data.updated_at
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_global_apply_identity(p_subject_id uuid, p_provider text, p_provider_player_id text, p_confidence numeric, p_observed_data jsonb, p_observed_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s djm_os.football_intelligence_subjects%rowtype; v_conf numeric:=greatest(0,least(1,coalesce(p_confidence,0)));
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required'; end if;
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then raise exception 'subject not found'; end if;
  insert into djm_os.football_subject_identity_evidence(subject_id,provider,provider_player_id,confidence,observed_data,observed_at,updated_at)
  values(p_subject_id,p_provider,p_provider_player_id,v_conf,coalesce(p_observed_data,'{}'::jsonb),coalesce(p_observed_at,now()),now())
  on conflict(subject_id,provider,provider_player_id) do update set confidence=excluded.confidence,observed_data=excluded.observed_data,observed_at=excluded.observed_at,updated_at=now();
  update djm_os.football_intelligence_subjects set
    football_provider_ids=coalesce(football_provider_ids,'{}'::jsonb)||jsonb_build_object(p_provider,p_provider_player_id),
    date_of_birth=coalesce(date_of_birth,nullif(p_observed_data->>'date_of_birth','')::date),
    nationality=coalesce(nationality,nullif(p_observed_data->>'nationality','')),
    primary_position=coalesce(primary_position,nullif(p_observed_data->>'position','')),
    identity_confidence=greatest(coalesce(identity_confidence,0),v_conf),
    identity_provider=case when v_conf>=coalesce(identity_confidence,0) then p_provider else identity_provider end,
    identity_verified_at=case when v_conf>=coalesce(identity_confidence,0) then coalesce(p_observed_at,now()) else identity_verified_at end,
    external_data_status=case when v_conf>=.80 then 'identity_verified' else external_data_status end,
    external_data_checked_at=now(),external_data_error=null,updated_at=now()
  where id=p_subject_id;
  update djm_os.football_intelligence_enrichment_queue set attempts=attempts+1,last_attempt_at=now(),next_attempt_at=now()+interval '12 hours',status='queued',last_error=null,updated_at=now() where subject_id=p_subject_id;
  perform djm_os.refresh_football_subject_scorecard(p_subject_id);
  return jsonb_build_object('ok',true,'subject_id',p_subject_id,'provider',p_provider,'provider_player_id',p_provider_player_id,'identity_confidence',v_conf);
end;$function$


CREATE OR REPLACE FUNCTION public.djm_global_enrichment_batch(p_limit integer DEFAULT 20)
 RETURNS TABLE(subject_id uuid, full_name text, date_of_birth date, nationality text, current_club text, current_country text, primary_position text, football_provider_ids jsonb, current_confidence smallint, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required'; end if;
  return query
  select s.id,s.full_name,s.date_of_birth,s.nationality,s.current_club,s.current_country,s.primary_position,s.football_provider_ids,q.current_confidence,q.attempts
  from djm_os.football_intelligence_enrichment_queue q
  join djm_os.football_intelligence_subjects s on s.id=q.subject_id
  where q.status in ('queued','blocked') and q.current_confidence<q.target_confidence and q.next_attempt_at<=now()
  order by q.priority asc,q.current_confidence asc,q.updated_at asc
  limit greatest(1,least(coalesce(p_limit,20),25));
end;$function$


CREATE OR REPLACE FUNCTION public.djm_global_enrichment_fail(p_subject_id uuid, p_error text, p_delay_hours integer DEFAULT 12)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required'; end if;
 update djm_os.football_intelligence_enrichment_queue set attempts=attempts+1,last_attempt_at=now(),next_attempt_at=now()+make_interval(hours=>greatest(1,least(coalesce(p_delay_hours,12),168))),status=case when attempts>=5 then 'blocked' else 'queued' end,last_error=left(p_error,500),updated_at=now() where subject_id=p_subject_id;
 update djm_os.football_intelligence_subjects set external_data_checked_at=now(),external_data_error=left(p_error,500),updated_at=now() where id=p_subject_id;
end;$function$


CREATE OR REPLACE FUNCTION public.djm_home()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'network',jsonb_build_object(
   'clubs',(select count(*) from djm_os.organisations),
   'club_contacts',(select count(*) from djm_os.people where person_type in ('club_contact','contact','club_staff','coach','sporting_director','recruitment')),
   'open_tasks',(select count(*) from djm_os.tasks where status not in ('done','completed','cancelled')),
   'review_items',(select count(*) from djm_os.review_items where status='open')
 ),
 'recruitment',jsonb_build_object(
   'active',(select count(*) from djm_os.scouting_prospects where linked_player_id is null and recruitment_stage not in ('signed','declined','lost')),
   'hot',(select count(*) from djm_os.scouting_prospects where linked_player_id is null and recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating')),
   'overdue',(select count(*) from djm_os.scouting_prospects where linked_player_id is null and next_action_at<now() and recruitment_stage not in ('signed','declined','lost'))
 ),
 'market',jsonb_build_object(
   'active_needs',(select count(*) from djm_os.club_needs where status in ('active','open','confirmed')),
   'active_signals',(select count(*) from djm_os.market_signals where status in ('active','watching')),
   'strong_matches',(select count(*) from djm_os.player_matches where status not in ('dismissed','rejected') and overall_score>=80),
   'active_deals',(select count(*) from djm_os.deal_rooms where status='active')
 ),
 'revenue_by_currency',coalesce((select jsonb_agg(to_jsonb(x) order by x.currency) from (
   select currency,
     count(*) active_deals,
     round(sum(coalesce(expected_commission,0)),2) potential_commission,
     round(sum(coalesce(expected_commission,0)*(probability::numeric/100)),2) weighted_commission
   from djm_os.deal_rooms where status='active' group by currency
 ) x),'[]'::jsonb),
 'closest_to_revenue',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select d.id,d.title,o.name organisation_name,
     coalesce(nullif(p.preferred_name,''),trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),sp.full_name) player_name,
     d.stage,d.expected_commission,d.currency,d.probability,
     round(coalesce(d.expected_commission,0)*(d.probability::numeric/100),2) weighted_value,
     d.primary_blocker,d.next_decision,d.next_action_at,tm.display_name owner_name
   from djm_os.deal_rooms d join djm_os.organisations o on o.id=d.organisation_id
   left join public.players p on p.id=d.player_id left join djm_os.scouting_prospects sp on sp.id=d.prospect_id
   left join djm_os.team_members tm on tm.user_id=d.owner_user_id
   where d.status='active'
   order by d.probability desc,d.next_action_at nulls last,coalesce(d.expected_commission,0) desc limit 8
 ) x),'[]'::jsonb),
 'top_actions',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select * from (
     select 'task'::text kind,t.id entity_id,t.title,
       least(100,coalesce(t.priority,3)*20 + case when t.due_at<now() then 20 when t.due_at<now()+interval '24 hours' then 10 else 0 end)::integer score,
       t.due_at action_at,null::text context
     from djm_os.tasks t where t.status not in ('done','completed','cancelled')
     union all
     select 'deal',d.id,d.title,
       least(100,round(d.probability*0.7 + case when d.next_action_at<now() then 25 when d.next_action_at<now()+interval '48 hours' then 15 else 5 end))::integer,
       d.next_action_at,coalesce(d.primary_blocker,d.next_decision,'Active deal')
     from djm_os.deal_rooms d where d.status='active'
     union all
     select 'recruitment',s.id,'Follow up: '||s.full_name,
       least(100,coalesce(s.recruitment_priority,3)*20 + case when s.next_action_at<now() then 15 else 0 end)::integer,
       s.next_action_at,coalesce(s.current_club,s.recruitment_stage)
     from djm_os.scouting_prospects s where s.linked_player_id is null and s.next_action_at is not null and s.recruitment_stage not in ('signed','declined','lost')
     union all
     select 'signal',ms.id,ms.title,(ms.urgency*20)::integer,ms.observed_at,ms.detail
     from djm_os.market_signals ms where ms.status in ('active','watching')
   ) u order by score desc,action_at nulls last limit 12
 ) x),'[]'::jsonb)
);
$function$


CREATE OR REPLACE FUNCTION public.djm_home_item_controls()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when not djm_os.is_team_member() then
      (select pg_catalog.jsonb_build_array())
    else coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'item_key',c.item_key,
          'state',c.state,
          'snoozed_until',c.snoozed_until
        ) order by c.updated_at desc
      )
      from djm_os.home_item_controls c
      where c.user_id=auth.uid()
        and (
          c.state='dismissed'
          or (c.state='snoozed' and c.snoozed_until>pg_catalog.now())
        )
    ),'[]'::jsonb)
  end;
$function$


CREATE OR REPLACE FUNCTION public.djm_home_set_item_control(p_item_key text, p_action text, p_snoozed_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_key text:=trim(coalesce(p_item_key,''));
  v_action text:=lower(trim(coalesce(p_action,'')));
begin
  if v_uid is null or not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  if length(v_key)<3 or length(v_key)>300 then
    raise exception 'Invalid Home item';
  end if;
  if v_action not in ('dismiss','snooze','restore') then
    raise exception 'Invalid Home action';
  end if;

  if v_action='restore' then
    delete from djm_os.home_item_controls
    where user_id=v_uid and item_key=v_key;
    return jsonb_build_object('item_key',v_key,'state','visible');
  end if;

  if v_action='snooze' and (p_snoozed_until is null or p_snoozed_until<=now()) then
    raise exception 'Snooze time must be in the future';
  end if;

  insert into djm_os.home_item_controls(user_id,item_key,state,snoozed_until)
  values(
    v_uid,
    v_key,
    case when v_action='dismiss' then 'dismissed' else 'snoozed' end,
    case when v_action='snooze' then p_snoozed_until else null end
  )
  on conflict(user_id,item_key) do update
  set state=excluded.state,
      snoozed_until=excluded.snoozed_until,
      updated_at=now();

  return jsonb_build_object(
    'item_key',v_key,
    'state',case when v_action='dismiss' then 'dismissed' else 'snoozed' end,
    'snoozed_until',case when v_action='snooze' then p_snoozed_until else null end
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_import_add_row(p_batch_id uuid, p_row_number integer, p_raw jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin if not exists(select 1 from djm_os.import_batches b where b.id=p_batch_id and b.submitted_by=auth.uid()) then raise exception 'Import batch not found'; end if; insert into djm_os.import_rows(batch_id,row_number,raw_json) values(p_batch_id,p_row_number,p_raw) on conflict(batch_id,row_number) do update set raw_json=excluded.raw_json,status='queued',error_message=null,processed_at=null returning id into v_id; update djm_os.import_batches set total_rows=(select count(*) from djm_os.import_rows where batch_id=p_batch_id) where id=p_batch_id; return v_id; end; $function$


CREATE OR REPLACE FUNCTION public.djm_import_contacts(p_source_name text, p_contacts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'djm_os'
AS $function$
declare v_batch uuid; v_item jsonb; v_result jsonb; v_count int:=0; v_created int:=0; v_updated int:=0; v_errors int:=0; v_person uuid; v_org uuid; v_action text;
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 if jsonb_typeof(p_contacts)<>'array' then raise exception 'contacts must be a JSON array'; end if;
 v_batch:=public.djm_create_import_batch('contacts',coalesce(nullif(p_source_name,''),'contacts import'),null);
 for v_item in select value from jsonb_array_elements(p_contacts) loop
   v_count:=v_count+1;
   begin
     v_result:=public.djm_network_upsert_person(coalesce(nullif(v_item->>'full_name',''),nullif(v_item->>'name','')),coalesce(nullif(v_item->>'person_type',''),'club_contact'),nullif(coalesce(v_item->>'whatsapp',v_item->>'phone'),''),nullif(v_item->>'email',''),nullif(v_item->>'linkedin_url',''),nullif(v_item->>'country',''),nullif(v_item->>'city',''),nullif(coalesce(v_item->>'club_name',v_item->>'organisation'),''),nullif(coalesce(v_item->>'role_title',v_item->>'title'),''),nullif(v_item->>'club_country',''));
     v_person:=(v_result->>'person_id')::uuid; v_org:=nullif(v_result->>'organisation_id','')::uuid; v_action:=case when coalesce((v_result->>'created')::boolean,false) then 'created' else 'updated' end;
     if v_action='created' then v_created:=v_created+1; else v_updated:=v_updated+1; end if;
     insert into djm_os.import_rows(batch_id,row_number,raw_json,status,person_id,organisation_id,match_confidence,processed_at,action) values(v_batch,v_count,v_item,'processed',v_person,v_org,1,now(),v_action);
   exception when others then v_errors:=v_errors+1; insert into djm_os.import_rows(batch_id,row_number,raw_json,status,error_message,processed_at,action) values(v_batch,v_count,v_item,'error',left(sqlerrm,500),now(),'error'); end;
 end loop;
 update djm_os.import_batches set status=case when v_errors>0 then 'completed_with_errors' else 'completed' end,total_rows=v_count,processed_rows=v_count,error_rows=v_errors,created_people=v_created,updated_people=v_updated,summary=jsonb_build_object('created_people',v_created,'updated_people',v_updated,'errors',v_errors),completed_at=now() where id=v_batch;
 return jsonb_build_object('batch_id',v_batch,'contacts_received',v_count,'created_people',v_created,'updated_people',v_updated,'errors',v_errors);
end $function$


CREATE OR REPLACE FUNCTION public.djm_import_detail(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'batch',to_jsonb(b),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('row_number',r.row_number,'status',r.status,'action',r.action,'person_id',r.person_id,'organisation_id',r.organisation_id,'match_confidence',r.match_confidence,'error_message',r.error_message,'processed_at',r.processed_at) order by r.row_number) from djm_os.import_rows r where r.batch_id=b.id),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'thread_id',m.thread_id,'sent_at',m.sent_at,'direction',m.direction,'sender_label',m.sender_label,'message_type',m.message_type,'processing_status',m.processing_status) order by m.sent_at) from djm_os.messages m where m.import_batch_id=b.id),'[]'::jsonb)
)
from djm_os.import_batches b where b.id=p_batch_id and b.submitted_by=(select auth.uid()) and exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active)
$function$


CREATE OR REPLACE FUNCTION public.djm_import_history(p_limit integer DEFAULT 50)
 RETURNS TABLE(batch_id uuid, source_type text, source_name text, status text, total_rows integer, processed_rows integer, created_people integer, updated_people integer, duplicate_rows integer, error_rows integer, summary jsonb, created_at timestamp with time zone, completed_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
select b.id,b.source_type,b.source_name,b.status,b.total_rows,b.processed_rows,b.created_people,b.updated_people,b.duplicate_rows,b.error_rows,b.summary,b.created_at,b.completed_at
from djm_os.import_batches b
where b.submitted_by=(select auth.uid()) and exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active)
order by b.created_at desc limit greatest(1,least(coalesce(p_limit,50),200))
$function$


CREATE OR REPLACE FUNCTION public.djm_import_whatsapp_messages(p_source_name text, p_external_thread_id text, p_thread_label text, p_person_id uuid, p_organisation_id uuid, p_messages jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'djm_os'
AS $function$
declare v_thread uuid; v_batch uuid; v_item jsonb; v_count int:=0; v_dupes int:=0; v_inserted int:=0; v_result jsonb; v_mid uuid;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if jsonb_typeof(p_messages)<>'array' then raise exception 'messages must be a JSON array'; end if;
  v_thread:=public.djm_upsert_thread('whatsapp',p_external_thread_id,p_person_id,p_organisation_id,p_thread_label,coalesce(p_metadata,'{}'::jsonb));
  v_batch:=public.djm_create_import_batch('whatsapp_export',coalesce(nullif(p_source_name,''),'WhatsApp export'),null);
  for v_item in select value from jsonb_array_elements(p_messages) loop
    v_count:=v_count+1;
    v_result:=public.djm_store_message(v_thread,coalesce((v_item->>'sent_at')::timestamptz,now()),coalesce(v_item->>'direction','inbound'),nullif(v_item->>'raw_text',''),nullif(v_item->>'external_message_id',''),nullif(v_item->>'sender_label',''),coalesce(nullif(v_item->>'message_type',''),'text'),nullif(v_item->>'asset_uri',''),nullif(v_item->>'transcript_text',''),nullif(v_item->>'reply_to_external_id',''));
    if coalesce((v_result->>'created')::boolean,false) then
      v_mid:=(v_result->>'message_id')::uuid; update djm_os.messages set import_batch_id=v_batch where id=v_mid; v_inserted:=v_inserted+1;
    else v_dupes:=v_dupes+1; end if;
  end loop;
  update djm_os.import_batches set status='completed',total_rows=v_count,processed_rows=v_count,duplicate_rows=v_dupes,summary=jsonb_build_object('thread_id',v_thread,'inserted_messages',v_inserted,'duplicate_messages',v_dupes,'metadata',coalesce(p_metadata,'{}'::jsonb)),completed_at=now() where id=v_batch;
  if p_person_id is null then
    insert into djm_os.review_items(owner_user_id,review_type,title,detail,confidence,payload,status)
    select (select auth.uid()),'thread_identity','Link WhatsApp thread',coalesce(p_thread_label,'Imported WhatsApp thread')||' needs a person/club link.',0.95,jsonb_build_object('thread_id',v_thread,'batch_id',v_batch),'open'
    where not exists(select 1 from djm_os.review_items r where r.review_type='thread_identity' and r.payload->>'thread_id'=v_thread::text and r.status='open');
  end if;
  return jsonb_build_object('thread_id',v_thread,'batch_id',v_batch,'messages_received',v_count,'messages_inserted',v_inserted,'duplicates',v_dupes);
end $function$


CREATE OR REPLACE FUNCTION public.djm_intelligence_benchmark_delete(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_competition_id uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  delete from djm_os.league_benchmarks where id = p_id returning competition_id into v_competition_id;
  if not found then raise exception 'Benchmark not found'; end if;
  insert into djm_os.events(event_type, actor_user_id, payload, source, confidence, occurred_at)
  values('BENCHMARK_REMOVED', auth.uid(), jsonb_build_object('benchmark_id', p_id, 'competition_id', v_competition_id), 'manual_ui', 1, now());
  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_intelligence_benchmark_import(p_source_name text, p_source_url text, p_observed_at timestamp with time zone, p_records jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_record jsonb;
  v_name text;
  v_country text;
  v_note text;
  v_raw numeric;
  v_effective smallint;
  v_aliases text[];
  v_tier smallint;
  v_result jsonb;
  v_id uuid;
  v_competition_id uuid;
  v_player_id uuid;
  v_count integer := 0;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if nullif(trim(coalesce(p_source_name,'')),'') is null then raise exception 'Source name is required'; end if;
  if nullif(trim(coalesce(p_source_url,'')),'') is null then raise exception 'Source URL is required'; end if;
  if p_observed_at is null then raise exception 'Observed date is required'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then raise exception 'Add at least one benchmark record'; end if;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    v_name := nullif(trim(coalesce(v_record->>'competition', v_record->>'display_name', v_record->>'league_name', '')), '');
    v_country := nullif(trim(coalesce(v_record->>'country','')), '');
    v_note := nullif(trim(coalesce(v_record->>'note', v_record->>'source_note', '')), '');
    if v_name is null then raise exception 'Every benchmark row requires a competition name'; end if;

    begin
      v_raw := coalesce(nullif(v_record->>'raw_strength_value','')::numeric, nullif(v_record->>'strength_score','')::numeric);
    exception when invalid_text_representation then
      raise exception 'Benchmark value for % is not numeric', v_name;
    end;
    if v_raw is null or v_raw < 0 or v_raw > 100 then raise exception 'Benchmark value for % must be between 0 and 100', v_name; end if;
    v_effective := round(v_raw)::smallint;

    if jsonb_typeof(v_record->'aliases') = 'array' then
      select coalesce(array_agg(trim(value)), '{}'::text[]) into v_aliases
      from jsonb_array_elements_text(v_record->'aliases') value
      where trim(value) <> '';
    else
      v_aliases := array(
        select trim(value)
        from unnest(string_to_array(coalesce(v_record->>'aliases',''), ',')) value
        where trim(value) <> ''
      );
    end if;

    begin
      v_tier := nullif(v_record->>'level_tier','')::smallint;
    exception when invalid_text_representation then
      v_tier := null;
    end;

    v_result := public.djm_intelligence_benchmark_upsert(
      null,
      null,
      v_name,
      v_country,
      coalesce(nullif(v_record->>'gender',''), 'male'),
      v_tier,
      coalesce(v_aliases, '{}'::text[]),
      '{}'::jsonb,
      v_effective,
      p_source_url,
      concat_ws(' | ', nullif(trim(p_source_name),''), v_note),
      p_observed_at,
      90
    );

    v_id := (v_result->>'id')::uuid;
    v_competition_id := (v_result->>'competition_id')::uuid;
    update djm_os.league_benchmarks
    set raw_strength_value = v_raw,
        raw_strength_scale = '0-100',
        benchmark_provider = case when lower(p_source_name || ' ' || p_source_url) ~ '(opta|stats perform|theanalyst\.com)'
          then 'Opta / Stats Perform reviewed source' else trim(p_source_name) end,
        benchmark_metric = case when lower(p_source_name || ' ' || p_source_url) ~ '(opta|stats perform|theanalyst\.com)'
          then 'league_average_power_rating' else 'competition_strength_0_100' end,
        methodology = case when lower(p_source_name || ' ' || p_source_url) ~ '(opta|stats perform|theanalyst\.com)'
          then 'Reviewed league-average competition strength on the provider 0-100 scale. Mean across active clubs, not top-five or top-ten average.'
          else coalesce(v_note, 'Reviewed competition-strength evidence on a documented 0-100 scale.') end,
        methodology_version = case when lower(p_source_name || ' ' || p_source_url) ~ '(opta|stats perform|theanalyst\.com)'
          then 'opta_league_average_v1' else 'djm_reviewed_strength_v1' end,
        source_reference = v_name,
        observed_at = p_observed_at,
        next_review_at = p_observed_at + interval '90 days',
        review_cadence_days = least(review_cadence_days, 90),
        updated_at = now()
    where id = v_id;

    for v_player_id in
      select p.id
      from public.players p
      cross join lateral public.djm_player_score_competition_context(p.id) context
      where (nullif(context->>'competition_id','') is not null and (context->>'competition_id')::uuid = v_competition_id)
         or lower(coalesce(context->>'competition_name','')) = lower(v_name)
    loop
      perform public.djm_player_scorecard(v_player_id);
    end loop;

    v_count := v_count + 1;
  end loop;

  insert into djm_os.events(event_type, actor_user_id, payload, source, confidence, occurred_at)
  values(
    'BENCHMARK_IMPORT_COMPLETED', auth.uid(),
    jsonb_build_object(
      'source_name', trim(p_source_name),
      'source_url', trim(p_source_url),
      'observed_at', p_observed_at,
      'records', v_count
    ),
    'reviewed_import', 1, now()
  );

  return jsonb_build_object('imported', v_count, 'source_name', trim(p_source_name), 'observed_at', p_observed_at);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_intelligence_benchmark_upsert(p_id uuid DEFAULT NULL::uuid, p_competition_id uuid DEFAULT NULL::uuid, p_display_name text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_level_tier smallint DEFAULT NULL::smallint, p_aliases text[] DEFAULT '{}'::text[], p_provider_ids jsonb DEFAULT '{}'::jsonb, p_strength_score smallint DEFAULT NULL::smallint, p_source_url text DEFAULT NULL::text, p_source_note text DEFAULT NULL::text, p_verified_at timestamp with time zone DEFAULT now(), p_review_cadence_days integer DEFAULT 365)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_competition_id uuid := p_competition_id;
  v_benchmark_id uuid;
  v_key text;
  v_event text;
  v_target_id uuid := p_id;
  v_existing boolean := false;
  v_player_id uuid;
  v_recalculated integer := 0;
  v_cadence integer;
  v_source_text text;
  v_is_opta boolean;
  v_provider text;
  v_metric text;
  v_methodology text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if nullif(trim(coalesce(p_display_name,'')),'') is null then raise exception 'Competition name is required'; end if;
  if p_strength_score is null or p_strength_score < 0 or p_strength_score > 100 then raise exception 'Strength score must be between 0 and 100'; end if;
  if nullif(trim(coalesce(p_source_url,'')),'') is null and nullif(trim(coalesce(p_source_note,'')),'') is null then
    raise exception 'Add a benchmark source URL or evidence note';
  end if;
  if p_verified_at is null then raise exception 'Verification date is required'; end if;
  if p_review_cadence_days < 30 or p_review_cadence_days > 1095 then raise exception 'Review cadence must be between 30 and 1095 days'; end if;

  v_source_text := lower(coalesce(p_source_url,'') || ' ' || coalesce(p_source_note,''));
  v_is_opta := v_source_text ~ '(theanalyst\.com|statsperform|opta)';
  v_cadence := case when v_is_opta then least(p_review_cadence_days, 90) else p_review_cadence_days end;
  v_provider := case when v_is_opta then 'Opta / Stats Perform reviewed source' else 'DJM reviewed source' end;
  v_metric := case when v_is_opta then 'league_average_power_rating' else 'competition_strength_0_100' end;
  v_methodology := case when v_is_opta
    then 'Reviewed league-average competition strength on the provider 0-100 scale. Use the mean across active clubs, not only the strongest teams.'
    else 'DJM reviewed competition-strength evidence on a documented 0-100 scale.' end;

  v_key := lower(regexp_replace(trim(coalesce(p_country,'') || '|' || p_display_name), '\s+', ' ', 'g'));
  if v_competition_id is null then
    insert into djm_os.competitions(
      canonical_key, display_name, country, gender, level_tier,
      aliases, provider_ids, created_by, updated_by
    ) values (
      v_key, trim(p_display_name), nullif(trim(coalesce(p_country,'')),''),
      nullif(trim(coalesce(p_gender,'')),''), p_level_tier,
      coalesce(p_aliases,'{}'::text[]), coalesce(p_provider_ids,'{}'::jsonb), auth.uid(), auth.uid()
    )
    on conflict (canonical_key) do update set
      display_name = excluded.display_name,
      country = excluded.country,
      gender = excluded.gender,
      level_tier = excluded.level_tier,
      aliases = excluded.aliases,
      provider_ids = excluded.provider_ids,
      updated_by = auth.uid(),
      updated_at = now()
    returning id into v_competition_id;
  else
    update djm_os.competitions set
      display_name = trim(p_display_name),
      country = nullif(trim(coalesce(p_country,'')),''),
      gender = nullif(trim(coalesce(p_gender,'')),''),
      level_tier = p_level_tier,
      aliases = coalesce(p_aliases,'{}'::text[]),
      provider_ids = coalesce(p_provider_ids,'{}'::jsonb),
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_competition_id;
    select canonical_key into v_key from djm_os.competitions where id = v_competition_id;
  end if;

  if v_target_id is null then
    select id into v_target_id
    from djm_os.league_benchmarks
    where competition_id = v_competition_id or canonical_key = v_key
    order by (competition_id = v_competition_id) desc
    limit 1;
  end if;
  v_existing := v_target_id is not null;
  v_event := case when v_existing then 'BENCHMARK_CHANGED' else 'BENCHMARK_CREATED' end;

  insert into djm_os.league_benchmarks(
    id, competition_id, canonical_key, league_name, country, strength_score,
    raw_strength_value, raw_strength_scale, benchmark_provider, benchmark_metric,
    methodology, methodology_version, source_reference,
    source_url, source_note, observed_at, verified_at, next_review_at,
    review_cadence_days, stale_at, stale_reason, updated_by
  ) values (
    coalesce(v_target_id, gen_random_uuid()), v_competition_id, v_key,
    trim(p_display_name), nullif(trim(coalesce(p_country,'')),''), p_strength_score,
    p_strength_score::numeric, '0-100', v_provider, v_metric,
    v_methodology, case when v_is_opta then 'opta_league_average_v1' else 'djm_reviewed_strength_v1' end,
    trim(p_display_name),
    nullif(trim(coalesce(p_source_url,'')),''), nullif(trim(coalesce(p_source_note,'')),''),
    p_verified_at, p_verified_at, p_verified_at + make_interval(days => v_cadence),
    v_cadence, null, null, auth.uid()
  )
  on conflict (id) do update set
    competition_id = excluded.competition_id,
    canonical_key = excluded.canonical_key,
    league_name = excluded.league_name,
    country = excluded.country,
    strength_score = excluded.strength_score,
    raw_strength_value = excluded.raw_strength_value,
    raw_strength_scale = excluded.raw_strength_scale,
    benchmark_provider = excluded.benchmark_provider,
    benchmark_metric = excluded.benchmark_metric,
    methodology = excluded.methodology,
    methodology_version = excluded.methodology_version,
    source_reference = excluded.source_reference,
    source_url = excluded.source_url,
    source_note = excluded.source_note,
    observed_at = excluded.observed_at,
    verified_at = excluded.verified_at,
    next_review_at = excluded.next_review_at,
    review_cadence_days = excluded.review_cadence_days,
    stale_at = null,
    stale_reason = null,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into v_benchmark_id;

  for v_player_id in
    select p.id
    from public.players p
    cross join lateral public.djm_player_score_competition_context(p.id) context
    where (nullif(context->>'competition_id','') is not null and (context->>'competition_id')::uuid = v_competition_id)
       or lower(coalesce(context->>'competition_name','')) = lower(trim(p_display_name))
  loop
    perform public.djm_player_scorecard(v_player_id);
    v_recalculated := v_recalculated + 1;
  end loop;

  insert into djm_os.events(event_type, actor_user_id, payload, source, confidence, occurred_at)
  values(v_event, auth.uid(), jsonb_build_object(
    'benchmark_id', v_benchmark_id,
    'competition_id', v_competition_id,
    'strength_score', p_strength_score,
    'benchmark_provider', v_provider,
    'benchmark_metric', v_metric,
    'methodology_version', case when v_is_opta then 'opta_league_average_v1' else 'djm_reviewed_strength_v1' end,
    'verified_at', p_verified_at,
    'next_review_at', p_verified_at + make_interval(days => v_cadence),
    'player_scores_recalculated', v_recalculated
  ), 'manual_ui', 1, now());

  return jsonb_build_object(
    'id', v_benchmark_id,
    'competition_id', v_competition_id,
    'canonical_key', v_key,
    'benchmark_provider', v_provider,
    'benchmark_metric', v_metric,
    'next_review_at', p_verified_at + make_interval(days => v_cadence),
    'player_scores_recalculated', v_recalculated
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_intelligence_data()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with verified_minutes as (
    select ce.player_id,
      sum(ce.minutes)::integer as minutes_24m,
      max(public.djm_career_evidence_date(ce.season_label, ce.start_date, ce.end_date)) as latest_playing_date,
      max(ce.source_reviewed_at) as latest_verified_at
    from public.career_entries ce
    where ce.source_reviewed_at is not null
      and public.djm_career_evidence_date(ce.season_label, ce.start_date, ce.end_date) >= current_date - interval '24 months'
    group by ce.player_id
  ), player_state as (
    select p.id,
      trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) as player_name,
      p.current_club, p.current_league, p.current_country, p.current_competition_id,
      p.transfermarkt_url, p.wyscout_url, p.stats_url, p.updated_at,
      (select coalesce(jsonb_agg(to_jsonb(ce) order by ce.sort_order, ce.start_date desc nulls last), '[]'::jsonb)
       from public.career_entries ce where ce.player_id = p.id) as career_entries,
      vm.minutes_24m, vm.latest_playing_date, vm.latest_verified_at,
      public.djm_player_score_competition_context(p.id) as competition_context,
      ps.model_score, ps.manual_score, ps.score_status, ps.confidence,
      ps.basis, ps.model_version, ps.calculated_at, ps.stale_at, ps.stale_reason, ps.override_reason
    from public.players p
    left join verified_minutes vm on vm.player_id = p.id
    left join djm_os.player_scorecards ps on ps.player_id = p.id
  ), player_with_benchmark as (
    select p.*,
      lb.id as benchmark_id,
      lb.strength_score,
      lb.verified_at as benchmark_verified_at,
      lb.benchmark_provider,
      lb.next_review_at
    from player_state p
    left join lateral (
      select b.*
      from djm_os.league_benchmarks b
      left join djm_os.competitions c on c.id = b.competition_id
      where b.verified_at is not null and (
        (nullif(p.competition_context->>'competition_id','') is not null and b.competition_id = (p.competition_context->>'competition_id')::uuid)
        or (
          nullif(p.competition_context->>'competition_name','') is not null
          and lower(b.league_name) = lower(p.competition_context->>'competition_name')
          and (b.country is null or nullif(p.competition_context->>'country','') is null or lower(b.country) = lower(p.competition_context->>'country'))
        )
        or (
          nullif(p.competition_context->>'competition_name','') is not null
          and (
            lower(c.display_name) = lower(p.competition_context->>'competition_name')
            or exists (select 1 from unnest(c.aliases) alias_name where lower(alias_name) = lower(p.competition_context->>'competition_name'))
          )
          and (c.country is null or nullif(p.competition_context->>'country','') is null or lower(c.country) = lower(p.competition_context->>'country'))
        )
      )
      order by (nullif(p.competition_context->>'competition_id','') is not null and b.competition_id = (p.competition_context->>'competition_id')::uuid) desc,
        b.verified_at desc
      limit 1
    ) lb on true
  ), gaps as (
    select 100 as priority, psu.player_id, p.player_name,
      'Incoming source suggestion awaiting review'::text as missing,
      'External evidence cannot become DJM truth before review.'::text as why,
      'Verified career evidence and downstream intelligence'::text as blocks,
      'Review the incoming evidence'::text as action,
      null::text as competition_name,
      null::text as recommended_source
    from public.player_source_suggestions psu join player_with_benchmark p on p.id = psu.player_id
    where psu.decision in ('pending','review_later')
    union all
    select 95, p.id, p.player_name, 'Competition evidence required',
      'The player has enough recent verified minutes, but DJM cannot resolve a current or recent verified senior competition.',
      'Player Score and competition-level comparisons', 'Verify recent competition evidence',
      null, null
    from player_with_benchmark p
    where p.minutes_24m >= 500 and nullif(p.competition_context->>'competition_name','') is null
    union all
    select 92, p.id, p.player_name,
      'Benchmark required: ' || (p.competition_context->>'competition_name'),
      'The player has enough recent verified minutes and a resolvable competition. The competition benchmark is the only missing model input.',
      'Player Score', 'Resolve benchmark',
      p.competition_context->>'competition_name', 'Opta Power Rankings / Stats Perform league average'
    from player_with_benchmark p
    where p.minutes_24m >= 500
      and nullif(p.competition_context->>'competition_name','') is not null
      and p.benchmark_id is null
    union all
    select 85, p.id, p.player_name, coalesce(p.stale_reason,'Player Score needs recalculation'),
      'Evidence changed after the last model calculation.', 'Current Player Score', 'Recalculate the Player Score',
      p.competition_context->>'competition_name', null
    from player_with_benchmark p where p.score_status = 'needs_recalculation' or p.stale_at is not null
    union all
    select 70, p.id, p.player_name, 'Not enough verified recent playing-time data',
      'Fewer than 500 verified senior minutes with defensible playing dates are recorded in the previous 24 months.',
      'Player Score', 'Import or verify recent season evidence',
      p.competition_context->>'competition_name', null
    from player_with_benchmark p where p.minutes_24m is null or p.minutes_24m < 500
    union all
    select 55, p.id, p.player_name, 'No football source links',
      'Staff has no direct route to supporting external evidence.',
      'Faster verification', 'Add a Wyscout, Transfermarkt or statistics reference',
      p.competition_context->>'competition_name', null
    from player_with_benchmark p where p.transfermarkt_url is null and p.wyscout_url is null and p.stats_url is null
  )
  select case when not djm_os.is_team_member() then
    jsonb_build_object('error','DJM team access required')
  else jsonb_build_object(
    'metrics', jsonb_build_object(
      'players', (select count(*) from player_with_benchmark),
      'players_with_source_links', (select count(*) from player_with_benchmark where transfermarkt_url is not null or wyscout_url is not null or stats_url is not null),
      'players_with_verified_career', (select count(*) from player_with_benchmark where latest_verified_at is not null),
      'players_eligible_for_score', (select count(*) from player_with_benchmark where minutes_24m >= 500 and benchmark_id is not null),
      'blocked_missing_benchmark', (select count(*) from player_with_benchmark where minutes_24m >= 500 and nullif(competition_context->>'competition_name','') is not null and benchmark_id is null),
      'blocked_competition_evidence', (select count(*) from player_with_benchmark where minutes_24m >= 500 and nullif(competition_context->>'competition_name','') is null),
      'blocked_insufficient_minutes', (select count(*) from player_with_benchmark where minutes_24m is null or minutes_24m < 500),
      'stale_scores', (select count(*) from player_with_benchmark where score_status = 'needs_recalculation' or stale_at is not null),
      'unresolved_suggestions', (select count(*) from public.player_source_suggestions where decision in ('pending','review_later')),
      'competitions_without_benchmark', (select count(*) from djm_os.competitions c where c.active and not exists(select 1 from djm_os.league_benchmarks lb where lb.competition_id = c.id and lb.verified_at is not null)),
      'benchmarks_due_review', (select count(*) from djm_os.league_benchmarks where coalesce(next_review_at, verified_at + interval '90 days') < now()),
      'recent_ingestion_failures', (select count(*) from public.player_source_refreshes where status = 'failed' and requested_at >= now() - interval '30 days')
    ),
    'players', coalesce((select jsonb_agg(to_jsonb(p) order by p.player_name) from player_with_benchmark p), '[]'::jsonb),
    'benchmarks', coalesce((select jsonb_agg(to_jsonb(x) order by x.league_name) from (
      select lb.*, c.display_name, c.gender, c.level_tier, c.aliases, c.provider_ids,
        tm.display_name as updated_by_name,
        case when lb.verified_at is null then 'unknown'
             when coalesce(lb.next_review_at, lb.verified_at + interval '90 days') < now() then 'stale'
             when lb.verified_at + interval '30 days' < now() then 'aging'
             else 'fresh' end as freshness
      from djm_os.league_benchmarks lb
      left join djm_os.competitions c on c.id = lb.competition_id
      left join djm_os.team_members tm on tm.user_id = lb.updated_by
    ) x), '[]'::jsonb),
    'competitions', coalesce((select jsonb_agg(to_jsonb(c) order by c.display_name) from djm_os.competitions c), '[]'::jsonb),
    'gaps', coalesce((select jsonb_agg(to_jsonb(g) order by g.priority desc, g.player_name) from (select * from gaps limit 100) g), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.requested_at desc) from (
      select pr.*, trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) as player_name
      from public.player_source_refreshes pr join public.players p on p.id = pr.player_id
      order by pr.requested_at desc limit 50
    ) r), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (
      select ps.*, trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) as player_name,
        pe.source_name, pe.source_url, pe.observed_at as evidence_observed_at, pe.freshness_state
      from public.player_source_suggestions ps
      join public.players p on p.id = ps.player_id
      left join djm_os.player_evidence pe on pe.id = ps.evidence_id
      where ps.decision in ('pending','review_later')
      order by ps.created_at desc limit 100
    ) s), '[]'::jsonb)
  ) end;
$function$


CREATE OR REPLACE FUNCTION public.djm_intelligence_manual_import(p_player_id uuid, p_source_name text, p_source_url text DEFAULT NULL::text, p_records jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_run_id uuid;
  v_record jsonb;
  v_current jsonb;
  v_evidence_id uuid;
  v_count integer := 0;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from public.players where id = p_player_id) then raise exception 'Player not found'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then raise exception 'Add at least one season record'; end if;
  if nullif(trim(coalesce(p_source_name,'')),'') is null then raise exception 'Source name is required'; end if;

  insert into public.player_source_refreshes(
    player_id, source, provider, source_url, status, requested_by,
    requested_at, started_at, completed_at, mode, capability,
    provider_version, payload_hash, fresh_at
  ) values (
    p_player_id, 'manual', 'manual', nullif(trim(coalesce(p_source_url,'')),''),
    'running', auth.uid(), now(), now(), null, 'manual_import', 'manual_import',
    'manual-v1', md5(p_records::text), now()
  ) returning id into v_run_id;

  insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
  values('SOURCE_REFRESH_REQUESTED', auth.uid(), p_player_id,
    jsonb_build_object('run_id', v_run_id, 'provider', 'manual', 'mode', 'manual_import'),
    'manual_import', 1, now());

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    if nullif(trim(coalesce(v_record->>'club_name','')),'') is null then
      raise exception 'Every imported season requires a club name';
    end if;
    select to_jsonb(c) into v_current
    from public.career_entries c
    where c.player_id = p_player_id
      and lower(coalesce(c.season_label,'')) = lower(coalesce(v_record->>'season_label',''))
      and lower(c.club_name) = lower(v_record->>'club_name')
    order by c.updated_at desc limit 1;

    insert into djm_os.player_evidence(
      refresh_id, player_id, entity_kind, field_name, value_json, provider,
      source_name, source_url, source_reference, truth_state, confidence,
      observed_at, fetched_at, freshness_state, review_state, payload_hash, metadata
    ) values (
      v_run_id, p_player_id, 'career_entry', 'career_entry', v_record, 'manual',
      trim(p_source_name), nullif(trim(coalesce(p_source_url,'')),''),
      coalesce(v_record->>'season_label','season record'), 'sourced', 1,
      now(), now(), 'fresh', 'pending', md5(v_record::text),
      jsonb_build_object('retention', 'normalised_only')
    ) returning id into v_evidence_id;

    insert into public.player_source_suggestions(
      refresh_id, player_id, field_name, current_value, suggested_value,
      confidence, source_evidence, decision, evidence_id, observed_at, truth_state
    ) values (
      v_run_id, p_player_id, 'career_entry', v_current, v_record,
      1, jsonb_build_object('source_name', trim(p_source_name), 'source_url', nullif(trim(coalesce(p_source_url,'')),'')),
      'pending', v_evidence_id, now(), 'sourced'
    );
    v_count := v_count + 1;
  end loop;

  update public.player_source_refreshes set
    status = 'needs_review',
    completed_at = now(),
    facts_discovered = v_count,
    review_required = v_count,
    summary = jsonb_build_object('season_records', v_count, 'raw_payload_retained', false),
    updated_at = now()
  where id = v_run_id;

  insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
  values('SOURCE_REFRESH_COMPLETED', auth.uid(), p_player_id,
    jsonb_build_object('run_id', v_run_id, 'facts_discovered', v_count, 'review_required', v_count),
    'manual_import', 1, now());

  return jsonb_build_object('run_id', v_run_id, 'facts_discovered', v_count, 'status', 'needs_review');
exception when others then
  if v_run_id is not null then
    insert into public.player_source_refreshes(
      id, player_id, source, provider, source_url, status, requested_by,
      requested_at, started_at, completed_at, mode, capability,
      facts_discovered, review_required, provider_version, payload_hash,
      fresh_at, error_text
    ) values (
      v_run_id, p_player_id, 'manual', 'manual', nullif(trim(coalesce(p_source_url,'')),''),
      'failed', auth.uid(), now(), now(), now(), 'manual_import', 'manual_import',
      0, 0, 'manual-v1', md5(coalesce(p_records,'[]'::jsonb)::text), now(), sqlerrm
    )
    on conflict (id) do update set
      status = 'failed', completed_at = now(), error_text = sqlerrm, updated_at = now();
    insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
    values('SOURCE_REFRESH_FAILED', auth.uid(), p_player_id, jsonb_build_object('run_id', v_run_id, 'error', sqlerrm), 'manual_import', 1, now());
  end if;
  return jsonb_build_object(
    'run_id', v_run_id,
    'status', 'failed',
    'error', sqlerrm,
    'facts_discovered', 0
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_intelligence_player(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case when not djm_os.is_team_member() then
    jsonb_build_object('error','DJM team access required')
  else jsonb_build_object(
    'scorecard', (select to_jsonb(ps) from djm_os.player_scorecards ps where ps.player_id = p_player_id),
    'evidence', coalesce((select jsonb_agg(to_jsonb(pe) order by pe.created_at desc) from (
      select * from djm_os.player_evidence where player_id = p_player_id order by created_at desc limit 50
    ) pe), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.requested_at desc) from (
      select * from public.player_source_refreshes where player_id = p_player_id order by requested_at desc limit 20
    ) pr), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(to_jsonb(ps) order by ps.created_at desc) from (
      select * from public.player_source_suggestions
      where player_id = p_player_id and decision in ('pending','review_later')
      order by created_at desc limit 30
    ) ps), '[]'::jsonb)
  ) end;
$function$


CREATE OR REPLACE FUNCTION public.djm_intelligence_review_suggestion(p_suggestion_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_suggestion public.player_source_suggestions%rowtype;
  v_value jsonb;
  v_career_id uuid;
  v_pending integer;
  v_accepted integer;
  v_rejected integer;
  v_run_status text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_decision not in ('accepted','rejected','kept_current','review_later') then raise exception 'Invalid review decision'; end if;
  select * into v_suggestion from public.player_source_suggestions where id = p_suggestion_id for update;
  if not found then raise exception 'Suggestion not found'; end if;
  if v_suggestion.decision not in ('pending','review_later') then raise exception 'Suggestion has already been reviewed'; end if;

  v_value := v_suggestion.suggested_value;
  if p_decision = 'accepted' and v_suggestion.field_name = 'career_entry' then
    select c.id into v_career_id
    from public.career_entries c
    where c.player_id = v_suggestion.player_id
      and lower(coalesce(c.season_label,'')) = lower(coalesce(v_value->>'season_label',''))
      and lower(c.club_name) = lower(v_value->>'club_name')
    order by c.updated_at desc limit 1;

    if v_career_id is null then
      insert into public.career_entries(
        player_id, club_name, league, country, season_label,
        appearances, starts, minutes, goals, assists,
        source_name, source_url, source_reviewed_at
      ) values (
        v_suggestion.player_id, v_value->>'club_name', nullif(v_value->>'league',''),
        nullif(v_value->>'country',''), nullif(v_value->>'season_label',''),
        nullif(v_value->>'appearances','')::integer, nullif(v_value->>'starts','')::integer,
        nullif(v_value->>'minutes','')::integer, nullif(v_value->>'goals','')::integer,
        nullif(v_value->>'assists','')::integer,
        coalesce(nullif(v_value->>'source_name',''), v_suggestion.source_evidence->>'source_name', 'Manual import'),
        coalesce(nullif(v_value->>'source_url',''), v_suggestion.source_evidence->>'source_url'), now()
      ) returning id into v_career_id;
    else
      update public.career_entries set
        league = case when v_value->'league' <> 'null'::jsonb then nullif(v_value->>'league','') else league end,
        country = case when v_value->'country' <> 'null'::jsonb then nullif(v_value->>'country','') else country end,
        appearances = case when v_value->'appearances' <> 'null'::jsonb then nullif(v_value->>'appearances','')::integer else appearances end,
        starts = case when v_value->'starts' <> 'null'::jsonb then nullif(v_value->>'starts','')::integer else starts end,
        minutes = case when v_value->'minutes' <> 'null'::jsonb then nullif(v_value->>'minutes','')::integer else minutes end,
        goals = case when v_value->'goals' <> 'null'::jsonb then nullif(v_value->>'goals','')::integer else goals end,
        assists = case when v_value->'assists' <> 'null'::jsonb then nullif(v_value->>'assists','')::integer else assists end,
        source_name = coalesce(nullif(v_value->>'source_name',''), v_suggestion.source_evidence->>'source_name', source_name),
        source_url = coalesce(nullif(v_value->>'source_url',''), v_suggestion.source_evidence->>'source_url', source_url),
        source_reviewed_at = now(),
        updated_at = now()
      where id = v_career_id;
    end if;
  end if;

  update public.player_source_suggestions set
    decision = p_decision,
    reviewed_by = case when p_decision = 'review_later' then null else auth.uid() end,
    reviewed_at = case when p_decision = 'review_later' then null else now() end,
    applied_at = case when p_decision = 'accepted' then now() else null end
  where id = p_suggestion_id;

  update djm_os.player_evidence set
    review_state = p_decision,
    truth_state = case when p_decision = 'accepted' then 'verified' when p_decision in ('rejected','kept_current') then truth_state else truth_state end,
    verified_at = case when p_decision in ('accepted','rejected','kept_current') then now() else null end,
    verified_by = case when p_decision in ('accepted','rejected','kept_current') then auth.uid() else null end,
    updated_at = now()
  where id = v_suggestion.evidence_id;

  select
    count(*) filter (where decision in ('pending','review_later')),
    count(*) filter (where decision = 'accepted'),
    count(*) filter (where decision in ('rejected','kept_current'))
  into v_pending, v_accepted, v_rejected
  from public.player_source_suggestions where refresh_id = v_suggestion.refresh_id;
  v_run_status := case when v_pending > 0 then 'needs_review' when v_accepted > 0 then 'applied' else 'rejected' end;
  update public.player_source_refreshes set
    status = v_run_status,
    review_required = v_pending,
    accepted_count = v_accepted,
    rejected_count = v_rejected,
    updated_at = now()
  where id = v_suggestion.refresh_id;

  insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
  values(
    case when p_decision = 'accepted' then 'EVIDENCE_ACCEPTED' else 'EVIDENCE_REVIEWED' end,
    auth.uid(), v_suggestion.player_id,
    jsonb_build_object('suggestion_id', p_suggestion_id, 'evidence_id', v_suggestion.evidence_id, 'decision', p_decision, 'career_entry_id', v_career_id),
    'manual_review', coalesce(v_suggestion.confidence, 1), now()
  );
  if p_decision = 'accepted' then
    insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
    values('CANONICAL_PLAYER_FACT_CHANGED', auth.uid(), v_suggestion.player_id,
      jsonb_build_object('field_name', v_suggestion.field_name, 'career_entry_id', v_career_id, 'suggestion_id', p_suggestion_id),
      'reviewed_evidence', coalesce(v_suggestion.confidence, 1), now());
    perform public.djm_player_scorecard(v_suggestion.player_id);
  end if;

  return jsonb_build_object('suggestion_id', p_suggestion_id, 'decision', p_decision, 'run_status', v_run_status, 'career_entry_id', v_career_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_league_benchmark_upsert(p_league_name text, p_country text, p_strength_score smallint, p_source_url text DEFAULT NULL::text, p_source_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_key text; v_id uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if nullif(trim(coalesce(p_league_name,'')),'') is null then raise exception 'League name is required'; end if;
  if p_strength_score is null or p_strength_score<0 or p_strength_score>100 then raise exception 'Strength score must be between 0 and 100'; end if;
  v_key:=lower(regexp_replace(trim(coalesce(p_country,'')||'|'||p_league_name),'\s+',' ','g'));
  insert into djm_os.league_benchmarks(canonical_key,league_name,country,strength_score,source_url,source_note,verified_at,updated_by) values(v_key,trim(p_league_name),nullif(trim(coalesce(p_country,'')),''),p_strength_score,nullif(trim(coalesce(p_source_url,'')),''),nullif(trim(coalesce(p_source_note,'')),''),now(),auth.uid()) on conflict(canonical_key) do update set league_name=excluded.league_name,country=excluded.country,strength_score=excluded.strength_score,source_url=excluded.source_url,source_note=excluded.source_note,verified_at=now(),updated_by=auth.uid(),updated_at=now() returning id into v_id;
  return jsonb_build_object('id',v_id,'canonical_key',v_key,'strength_score',p_strength_score);
end; $function$


commit;
