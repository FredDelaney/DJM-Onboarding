create or replace function djm_os.seed_freshness_queue()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_people int:=0; v_needs int:=0; v_players int:=0; v_orgs int:=0; v_prospects int:=0;
begin
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'person',p.id,'employment',case when exists(select 1 from djm_os.relationships r where r.person_id=p.id and coalesce(r.strength_score,0)>=70) then 85 else 55 end,'Keep current club/role accurate',now(),coalesce(p.linkedin_url,'public_sources')
  from djm_os.people p where coalesce(p.last_verified_at,p.updated_at)<now()-interval '60 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,excluded.priority),reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),source_hint=coalesce(excluded.source_hint,djm_os.freshness_queue.source_hint),updated_at=now(); get diagnostics v_people=row_count;
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'organisation',o.id,'identity',case when exists(select 1 from djm_os.club_needs n where n.organisation_id=o.id and n.status in ('active','open','confirmed')) then 80 else 45 end,'Keep club identity and official site current',now(),coalesce(o.website_url,'public_sources')
  from djm_os.organisations o where coalesce(o.last_verified_at,o.updated_at)<now()-interval '120 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,excluded.priority),reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),source_hint=coalesce(excluded.source_hint,djm_os.freshness_queue.source_hint),updated_at=now(); get diagnostics v_orgs=row_count;
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'club_need',n.id,'need_status',90,'Club requirements go stale quickly',now(),'relationship_reconfirm' from djm_os.club_needs n where n.status in ('active','open','confirmed') and coalesce(n.confirmed_at,n.created_at)<now()-interval '21 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=excluded.priority,reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),updated_at=now(); get diagnostics v_needs=row_count;
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'player',p.id,'market_profile',case when p.football_status in ('active','free_agent','loan') then 75 else 55 end,'Keep player club, contract and market status fresh',now(),coalesce(p.transfermarkt_url,p.wyscout_url,'player_or_public_sources') from public.players p where coalesce(p.updated_at,p.created_at)<now()-interval '45 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,excluded.priority),reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),source_hint=coalesce(excluded.source_hint,djm_os.freshness_queue.source_hint),updated_at=now(); get diagnostics v_players=row_count;
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'prospect',s.id,'prospect_status',55,'Keep prospect club, contract and representation status fresh',now(),coalesce(s.transfermarkt_url,s.wyscout_url,'public_sources') from djm_os.scouting_prospects s where coalesce(s.last_verified_at,s.updated_at)<now()-interval '60 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,excluded.priority),reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),source_hint=coalesce(excluded.source_hint,djm_os.freshness_queue.source_hint),updated_at=now(); get diagnostics v_prospects=row_count;
  return jsonb_build_object('people',v_people,'organisations',v_orgs,'needs',v_needs,'players',v_players,'prospects',v_prospects);
end $$;

create or replace function public.djm_enrichment_claim(p_limit int default 10)
returns table(job_id uuid,entity_type text,entity_id uuid,check_type text,priority smallint,reason text,source_hint text)
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 return query
 with pick as (
   select q.id from djm_os.freshness_queue q where q.status in ('queued','due','failed') and coalesce(q.next_check_at,now())<=now() and (q.locked_at is null or q.locked_at<now()-interval '30 minutes') order by q.priority desc,coalesce(q.next_check_at,q.created_at),q.created_at for update skip locked limit greatest(1,least(coalesce(p_limit,10),50))
 ), upd as (
   update djm_os.freshness_queue q set status='processing',locked_at=now(),attempts=q.attempts+1,updated_at=now() from pick where q.id=pick.id returning q.*
 ) select u.id,u.entity_type,u.entity_id,u.check_type,u.priority,u.reason,u.source_hint from upd u;
end $$;
revoke all on function public.djm_enrichment_claim(int) from public,anon;
grant execute on function public.djm_enrichment_claim(int) to authenticated;

create or replace function public.djm_enrichment_fail(p_job_id uuid,p_error text,p_retry_hours int default 24)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 update djm_os.freshness_queue set status='failed',locked_at=null,next_check_at=now()+make_interval(hours=>greatest(1,least(coalesce(p_retry_hours,24),168))),result_json=coalesce(result_json,'{}'::jsonb)||jsonb_build_object('last_error',left(coalesce(p_error,'Unknown error'),1000),'failed_at',now()),updated_at=now() where id=p_job_id;
 if not found then raise exception 'Enrichment job not found'; end if;
 return jsonb_build_object('job_id',p_job_id,'status','failed','retry_at',(select next_check_at from djm_os.freshness_queue where id=p_job_id));
end $$;
revoke all on function public.djm_enrichment_fail(uuid,text,int) from public,anon;
grant execute on function public.djm_enrichment_fail(uuid,text,int) to authenticated;

create or replace function djm_os.recover_stale_enrichment_locks()
returns int language plpgsql security definer set search_path='' as $$
declare v int; begin update djm_os.freshness_queue set status='queued',locked_at=null,next_check_at=now(),updated_at=now() where status='processing' and locked_at<now()-interval '45 minutes'; get diagnostics v=row_count; return v; end $$;
