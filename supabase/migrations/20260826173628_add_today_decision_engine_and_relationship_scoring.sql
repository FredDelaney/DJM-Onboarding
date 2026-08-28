create or replace function djm_os.recalculate_relationship_scores(p_person_id uuid default null)
returns integer
language plpgsql
security definer
set search_path=''
as $$
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
$$;
revoke all on function djm_os.recalculate_relationship_scores(uuid) from public,anon,authenticated;

create or replace function djm_os.refresh_today_suggestions()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_rel int:=0;v_need int:=0;v_match int:=0;v_task int:=0;
begin
  perform djm_os.recalculate_relationship_scores(null);

  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,person_id,organisation_id,score,status,fingerprint,source,expires_at)
  select r.team_member_id,'relationship_reengage','Reconnect with '||p.full_name,
         coalesce(o.name||' · ','')||'Relationship score '||coalesce(r.strength_score,0)||'. No meaningful interaction for '||greatest(1,floor(extract(epoch from (now()-r.last_meaningful_at))/86400))::int||' days.',
         p.id,o.id,
         least(95,greatest(60,coalesce(r.strength_score,50)))::smallint,
         'open','today:reengage:'||r.team_member_id::text||':'||r.person_id::text||':'||to_char(current_date,'IYYY-IW'),'today_engine',now()+interval '8 days'
  from djm_os.relationships r
  join djm_os.people p on p.id=r.person_id
  left join lateral(select e.organisation_id from djm_os.employments e where e.person_id=p.id and e.is_current=true order by e.created_at desc limit 1) ce on true
  left join djm_os.organisations o on o.id=ce.organisation_id
  where r.strength_score>=55 and r.last_meaningful_at is not null and r.last_meaningful_at<now()-interval '45 days'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_rel=row_count;

  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,organisation_id,club_need_id,score,status,fingerprint,source,expires_at)
  select n.owner_user_id,'need_reconfirm','Reconfirm '||coalesce(o.name,'club')||' need: '||coalesce(n.position,n.title),
         'This club need is still active but has not been updated for '||greatest(1,floor(extract(epoch from (now()-n.updated_at))/86400))::int||' days. Reconfirm before presenting players.',
         n.organisation_id,n.id,75,'open','today:need:'||n.id::text||':'||to_char(current_date,'IYYY-IW'),'today_engine',now()+interval '8 days'
  from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id
  where n.status in ('active','open','confirmed') and n.updated_at<now()-interval '21 days'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_need=row_count;

  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,organisation_id,player_id,club_need_id,score,status,fingerprint,source,expires_at)
  select n.owner_user_id,'high_match','Review '||coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'player')||' for '||o.name,
         'Automatic first-pass match scored '||round(m.overall_score)||'/100 for the '||coalesce(n.position,n.title)||' requirement.',
         n.organisation_id,p.id,n.id,
         least(98,greatest(70,round(m.overall_score)::int))::smallint,
         'open','today:match:'||m.id::text||':'||to_char(current_date,'IYYY-IW'),'today_engine',now()+interval '8 days'
  from djm_os.player_matches m
  join djm_os.club_needs n on n.id=m.club_need_id
  join djm_os.organisations o on o.id=n.organisation_id
  join public.players p on p.id=m.player_id
  where n.status in ('active','open','confirmed') and m.status='suggested' and m.overall_score>=80
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_match=row_count;

  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,person_id,organisation_id,score,status,fingerprint,source,expires_at)
  select t.owner_user_id,'task_due',t.title,
         case when t.due_at<now() then 'Overdue follow-up' else 'Follow-up due soon' end||coalesce(' · '||p.full_name,'')||coalesce(' · '||o.name,''),
         t.person_id,t.organisation_id,
         case when t.due_at<now() then 92 else 82 end,
         'open','today:task:'||t.id::text||':'||to_char(current_date,'YYYY-MM-DD'),'today_engine',now()+interval '2 days'
  from djm_os.tasks t
  left join djm_os.people p on p.id=t.person_id
  left join djm_os.organisations o on o.id=t.organisation_id
  where t.status not in ('done','completed','cancelled') and t.due_at is not null and t.due_at<now()+interval '48 hours'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_task=row_count;

  update djm_os.suggestions set status='expired' where status='open' and expires_at is not null and expires_at<now();
  return jsonb_build_object('relationship',v_rel,'needs',v_need,'matches',v_match,'tasks',v_task);
end;
$$;
revoke all on function djm_os.refresh_today_suggestions() from public,anon,authenticated;

create or replace function public.djm_today()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
select jsonb_build_object(
 'summary',jsonb_build_object(
   'open_tasks',(select count(*) from djm_os.tasks where status not in ('done','completed','cancelled') and (owner_user_id is null or owner_user_id=auth.uid())),
   'active_needs',(select count(*) from djm_os.club_needs where status in ('active','open','confirmed')),
   'high_matches',(select count(*) from djm_os.player_matches m join djm_os.club_needs n on n.id=m.club_need_id where n.status in ('active','open','confirmed') and m.status='suggested' and m.overall_score>=80),
   'meetings_today',(select count(*) from djm_os.meetings where owner_user_id=auth.uid() and starts_at>=date_trunc('day',now()) and starts_at<date_trunc('day',now())+interval '1 day' and status not in ('cancelled','no_show'))
 ),
 'suggestions',coalesce((select jsonb_agg(to_jsonb(x) order by x.score desc,x.created_at desc) from (
   select s.id,s.suggestion_type,s.title,s.reason,s.score,s.person_id,p.full_name person_name,s.organisation_id,o.name organisation_name,s.player_id,s.club_need_id,s.created_at,s.expires_at
   from djm_os.suggestions s
   left join djm_os.people p on p.id=s.person_id
   left join djm_os.organisations o on o.id=s.organisation_id
   where s.status='open' and (s.owner_user_id is null or s.owner_user_id=auth.uid()) and (s.expires_at is null or s.expires_at>now())
   order by s.score desc,s.created_at desc limit 12
 ) x),'[]'::jsonb),
 'meetings',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (
   select m.id,m.title,m.starts_at,m.ends_at,m.status,m.person_id,p.full_name person_name,m.organisation_id,o.name organisation_name,m.meeting_url
   from djm_os.meetings m left join djm_os.people p on p.id=m.person_id left join djm_os.organisations o on o.id=m.organisation_id
   where m.owner_user_id=auth.uid() and m.starts_at>=date_trunc('day',now()) and m.starts_at<date_trunc('day',now())+interval '1 day' and m.status not in ('cancelled','no_show')
 ) x),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(to_jsonb(x) order by x.priority desc,x.due_at asc nulls last) from (
   select t.id,t.title,t.task_type,t.priority,t.due_at,t.person_id,p.full_name person_name,t.organisation_id,o.name organisation_name
   from djm_os.tasks t left join djm_os.people p on p.id=t.person_id left join djm_os.organisations o on o.id=t.organisation_id
   where t.status not in ('done','completed','cancelled') and (t.owner_user_id is null or t.owner_user_id=auth.uid())
   order by t.priority desc,t.due_at asc nulls last limit 10
 ) x),'[]'::jsonb)
);
$$;
revoke execute on function public.djm_today() from public,anon;
grant execute on function public.djm_today() to authenticated;

select cron.unschedule(jobid) from cron.job where jobname='djm-os-today-refresh';
select cron.schedule('djm-os-today-refresh','7 */4 * * *','select djm_os.refresh_today_suggestions();');
notify pgrst,'reload schema';
