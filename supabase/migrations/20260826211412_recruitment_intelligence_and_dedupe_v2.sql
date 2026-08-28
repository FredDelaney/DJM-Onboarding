create or replace function public.djm_recruitment_upsert_target(
  p_full_name text,
  p_date_of_birth date default null,
  p_nationality text default null,
  p_current_club text default null,
  p_current_country text default null,
  p_primary_position text default null,
  p_secondary_positions text[] default '{}'::text[],
  p_preferred_foot text default null,
  p_contract_expiry date default null,
  p_transfermarkt_url text default null,
  p_instagram_url text default null,
  p_whatsapp text default null,
  p_email text default null,
  p_agent_status text default null,
  p_agent_name text default null,
  p_availability_status text default 'unknown',
  p_recruitment_priority smallint default 50,
  p_recruitment_source text default 'manual',
  p_notes text default null
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare v_id uuid; v_key text; v_created boolean:=false; v_tm text:=nullif(trim(coalesce(p_transfermarkt_url,'')),'');
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_full_name is null or length(trim(p_full_name))<2 then raise exception 'Player name is required'; end if;
  if p_recruitment_priority<0 or p_recruitment_priority>100 then raise exception 'Priority must be 0-100'; end if;
  if p_availability_status not in ('unknown','monitor','approachable','available','represented','signed_djm','not_interested','do_not_contact') then raise exception 'Invalid availability status'; end if;
  v_key:=lower(regexp_replace(trim(p_full_name),'[^a-zA-Z0-9]+','-','g'))||':'||coalesce(to_char(p_date_of_birth,'YYYY-MM-DD'),'unknown');
  if v_tm is not null then select id into v_id from djm_os.scouting_prospects where lower(trim(transfermarkt_url))=lower(v_tm) limit 1; end if;
  if v_id is null then select id into v_id from djm_os.scouting_prospects where canonical_key=v_key limit 1; end if;
  if v_id is null then
    insert into djm_os.scouting_prospects(full_name,date_of_birth,nationality,current_club,current_country,primary_position,secondary_positions,preferred_foot,contract_expiry,transfermarkt_url,instagram_url,whatsapp,email,agent_status,agent_name,availability_status,source,recruitment_source,source_confidence,owner_user_id,canonical_key,last_verified_at,notes,recruitment_priority,recruitment_stage)
    values(trim(p_full_name),p_date_of_birth,nullif(trim(p_nationality),''),nullif(trim(p_current_club),''),nullif(trim(p_current_country),''),nullif(trim(p_primary_position),''),coalesce(p_secondary_positions,'{}'::text[]),nullif(trim(p_preferred_foot),''),p_contract_expiry,v_tm,nullif(trim(p_instagram_url),''),nullif(trim(p_whatsapp),''),nullif(lower(trim(p_email)),''),nullif(trim(p_agent_status),''),nullif(trim(p_agent_name),''),p_availability_status,'recruitment',coalesce(nullif(trim(p_recruitment_source),''),'manual'),1,(select auth.uid()),v_key,now(),nullif(trim(p_notes),''),p_recruitment_priority,'identified') returning id into v_id;
    v_created:=true;
  else
    update djm_os.scouting_prospects set
      full_name=coalesce(nullif(trim(p_full_name),''),full_name),date_of_birth=coalesce(p_date_of_birth,date_of_birth),nationality=coalesce(nullif(trim(p_nationality),''),nationality),current_club=coalesce(nullif(trim(p_current_club),''),current_club),current_country=coalesce(nullif(trim(p_current_country),''),current_country),primary_position=coalesce(nullif(trim(p_primary_position),''),primary_position),secondary_positions=case when cardinality(coalesce(p_secondary_positions,'{}'::text[]))>0 then p_secondary_positions else secondary_positions end,preferred_foot=coalesce(nullif(trim(p_preferred_foot),''),preferred_foot),contract_expiry=coalesce(p_contract_expiry,contract_expiry),transfermarkt_url=coalesce(v_tm,transfermarkt_url),instagram_url=coalesce(nullif(trim(p_instagram_url),''),instagram_url),whatsapp=coalesce(nullif(trim(p_whatsapp),''),whatsapp),email=coalesce(nullif(lower(trim(p_email)),''),email),agent_status=coalesce(nullif(trim(p_agent_status),''),agent_status),agent_name=coalesce(nullif(trim(p_agent_name),''),agent_name),availability_status=coalesce(p_availability_status,availability_status),recruitment_priority=coalesce(p_recruitment_priority,recruitment_priority),recruitment_source=coalesce(nullif(trim(p_recruitment_source),''),recruitment_source),notes=coalesce(nullif(trim(p_notes),''),notes),last_verified_at=now(),updated_at=now()
    where id=v_id;
  end if;
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(case when v_created then 'RECRUITMENT_TARGET_CREATED' else 'RECRUITMENT_TARGET_UPDATED' end,(select auth.uid()),jsonb_build_object('prospect_id',v_id,'name',trim(p_full_name),'priority',p_recruitment_priority),'recruitment',1,now());
  return jsonb_build_object('prospect_id',v_id,'created',v_created);
end $$;

grant execute on function public.djm_recruitment_upsert_target(text,date,text,text,text,text,text[],text,date,text,text,text,text,text,text,text,smallint,text,text) to authenticated;

create or replace function public.djm_recruitment_dashboard()
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;
  return jsonb_build_object(
    'summary',jsonb_build_object(
      'active',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost')),
      'hot',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating')),
      'overdue',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost','paused') and sp.next_action_at<now()),
      'untouched_high_priority',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage in ('identified','researching','ready_to_contact') and sp.recruitment_priority>=70 and sp.first_contact_at is null)
    ),
    'priority_targets',coalesce((select jsonb_agg(to_jsonb(x) order by x.priority_score desc) from (
      select sp.id,sp.full_name,sp.current_club,sp.primary_position,sp.recruitment_stage,sp.recruitment_priority,sp.next_action_at,sp.last_contact_at,sp.last_reply_at,sp.owner_user_id,tm.display_name as owner_name,
        least(100,sp.recruitment_priority + case when sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating') then 20 else 0 end + case when sp.next_action_at<now() then 15 else 0 end)::int as priority_score
      from djm_os.scouting_prospects sp left join djm_os.team_members tm on tm.user_id=sp.owner_user_id
      where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost','paused')
      order by priority_score desc,sp.next_action_at nulls last limit 25
    ) x),'[]'::jsonb),
    'overdue',coalesce((select jsonb_agg(to_jsonb(x) order by x.next_action_at) from (
      select sp.id,sp.full_name,sp.current_club,sp.primary_position,sp.recruitment_stage,sp.recruitment_priority,sp.next_action_at,tm.display_name as owner_name
      from djm_os.scouting_prospects sp left join djm_os.team_members tm on tm.user_id=sp.owner_user_id
      where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost','paused') and sp.next_action_at<now()
      order by sp.next_action_at limit 25
    ) x),'[]'::jsonb),
    'recent_activity',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (
      select ri.id,ri.prospect_id,sp.full_name,ri.channel,ri.direction,ri.summary,ri.occurred_at,tm.display_name as owner_name
      from djm_os.recruitment_interactions ri join djm_os.scouting_prospects sp on sp.id=ri.prospect_id left join djm_os.team_members tm on tm.user_id=ri.owner_user_id
      order by ri.occurred_at desc limit 30
    ) x),'[]'::jsonb)
  );
end $$;

grant execute on function public.djm_recruitment_dashboard() to authenticated;

create or replace function djm_os.refresh_recruitment_suggestions()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count int:=0; v_rows int:=0;
begin
  delete from djm_os.suggestions where suggestion_type in ('recruitment_overdue','recruitment_high_priority_untouched') and status='open' and expires_at<now();
  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,score,status,fingerprint,source,created_at,expires_at)
  select coalesce(sp.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),
    'recruitment_overdue','Follow up with '||sp.full_name,
    'Recruitment follow-up is overdue'||case when sp.current_club is not null then ' · '||sp.current_club else '' end,
    least(100,70+greatest(0,extract(day from now()-sp.next_action_at)::int))::smallint,'open','recruitment-overdue:'||sp.id::text,'recruitment',now(),now()+interval '2 days'
  from djm_os.scouting_prospects sp
  where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost','paused') and sp.next_action_at<now()
    and not exists(select 1 from djm_os.suggestions s where s.fingerprint='recruitment-overdue:'||sp.id::text and s.status='open' and s.expires_at>now());
  get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,score,status,fingerprint,source,created_at,expires_at)
  select coalesce(sp.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),
    'recruitment_high_priority_untouched','Make first contact: '||sp.full_name,
    'High-priority recruitment target has not been contacted yet'||case when sp.current_club is not null then ' · '||sp.current_club else '' end,
    least(100,sp.recruitment_priority)::smallint,'open','recruitment-untouched:'||sp.id::text,'recruitment',now(),now()+interval '7 days'
  from djm_os.scouting_prospects sp
  where sp.linked_player_id is null and sp.recruitment_stage in ('identified','researching','ready_to_contact') and sp.recruitment_priority>=70 and sp.first_contact_at is null
    and not exists(select 1 from djm_os.suggestions s where s.fingerprint='recruitment-untouched:'||sp.id::text and s.status='open' and s.expires_at>now());
  get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
  return v_count;
end $$;

revoke all on function djm_os.refresh_recruitment_suggestions() from public,anon,authenticated;
select cron.unschedule(jobid) from cron.job where jobname='djm-recruitment-suggestions';
select cron.schedule('djm-recruitment-suggestions','29 */4 * * *','select djm_os.refresh_recruitment_suggestions();');
