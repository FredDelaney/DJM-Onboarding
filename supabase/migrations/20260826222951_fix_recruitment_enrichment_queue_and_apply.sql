create or replace function public.djm_enrichment_claim(p_limit integer default 10)
returns table(job_id uuid, entity_type text, entity_id uuid, check_type text, priority smallint, reason text, source_hint text)
language plpgsql
set search_path=''
as $function$
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
end $function$;

create or replace function public.djm_enrichment_due(p_limit integer default 25)
returns table(job_id uuid, entity_type text, entity_id uuid, entity_name text, check_type text, priority smallint, reason text, source_hint text, last_checked_at timestamptz, next_check_at timestamptz, current_context jsonb)
language sql
set search_path=''
as $function$
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
$function$;

create or replace function public.djm_enrichment_submit(p_job_id uuid, p_observed jsonb, p_source_uri text, p_source_name text, p_confidence numeric)
returns jsonb
language plpgsql
set search_path=''
as $function$
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
end $function$;
