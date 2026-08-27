-- DJM OS V8 Command Center
-- Mirrors production migration 20260827085500.

create or replace function public.djm_command_center()
returns jsonb
language plpgsql
stable
set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_focus jsonb;
  v_opportunities jsonb;
  v_quality jsonb;
  v_summary jsonb;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;

  select jsonb_build_object(
    'open_tasks',(select count(*) from djm_os.tasks t where t.status not in ('done','completed','cancelled') and (t.owner_user_id is null or t.owner_user_id=v_uid)),
    'overdue_tasks',(select count(*) from djm_os.tasks t where t.status not in ('done','completed','cancelled') and (t.owner_user_id is null or t.owner_user_id=v_uid) and t.due_at<now()),
    'reviews',(select count(*) from djm_os.review_items r where r.status='open' and (r.owner_user_id is null or r.owner_user_id=v_uid)),
    'meetings_7d',(select count(*) from djm_os.meetings m where m.owner_user_id=v_uid and m.status not in ('cancelled','no_show') and m.starts_at>=now() and m.starts_at<now()+interval '7 days'),
    'club_contacts',(select count(*) from djm_os.people p where coalesce(p.person_type,'club_contact')<>'player'),
    'clubs',(select count(*) from djm_os.organisations o where o.organisation_type='club'),
    'recruitment_active',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost')),
    'recruitment_hot',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating')),
    'active_needs',(select count(*) from djm_os.club_needs n where n.status in ('active','open','confirmed')),
    'needs_without_matches',(select count(*) from djm_os.club_needs n where n.status in ('active','open','confirmed') and not exists(select 1 from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected'))),
    'active_deals',(select count(*) from djm_os.deal_rooms d where d.status='active')
  ) into v_summary;

  with focus_items as (
    select 'review'::text kind,r.id,r.title,coalesce(r.detail,'Needs a quick human check') subtitle,r.created_at action_at,98::int score,'/network'::text href,null::text action,r.created_at created_at
    from djm_os.review_items r
    where r.status='open' and (r.owner_user_id is null or r.owner_user_id=v_uid)

    union all

    select 'task',t.id,t.title,
      concat_ws(' · ',nullif(p.full_name,''),nullif(o.name,''),case when t.due_at<now() then 'Overdue' else null end),
      t.due_at,
      least(100,55+coalesce(t.priority,3)*5+case when t.due_at<now() then 20 when t.due_at<now()+interval '24 hours' then 10 else 0 end)::int,
      case
        when t.source like 'recruitment:%' then '/recruitment/'||replace(t.source,'recruitment:','')
        when t.person_id is not null then '/network/contacts/'||t.person_id::text
        when t.organisation_id is not null then '/network/clubs/'||t.organisation_id::text
        else '/network'
      end,
      'complete',t.created_at
    from djm_os.tasks t
    left join djm_os.people p on p.id=t.person_id
    left join djm_os.organisations o on o.id=t.organisation_id
    where t.status not in ('done','completed','cancelled') and (t.owner_user_id is null or t.owner_user_id=v_uid)

    union all

    select 'recruitment',sp.id,'Recruitment · '||sp.full_name,
      concat_ws(' · ',nullif(sp.current_club,''),nullif(sp.primary_position,''),replace(coalesce(sp.recruitment_stage,'identified'),'_',' ')),
      sp.next_action_at,
      least(100,45+coalesce(sp.recruitment_priority,3)*8+case when sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating') then 20 else 0 end+case when sp.next_action_at<now() then 15 else 0 end)::int,
      '/recruitment/'||sp.id::text,
      null,sp.created_at
    from djm_os.scouting_prospects sp
    where sp.linked_player_id is null
      and sp.recruitment_stage not in ('signed','declined','lost','paused')
      and (sp.owner_user_id is null or sp.owner_user_id=v_uid)
      and (
        sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating')
        or sp.next_action_at is null
        or sp.next_action_at<now()+interval '3 days'
        or (sp.recruitment_priority>=4 and sp.first_contact_at is null)
      )
      and not exists(select 1 from djm_os.tasks t where t.source='recruitment:'||sp.id::text and t.status not in ('done','completed','cancelled'))

    union all

    select 'meeting',m.id,'Meeting · '||m.title,concat_ws(' · ',nullif(p.full_name,''),nullif(o.name,'')),m.starts_at,
      case when m.starts_at<now()+interval '24 hours' then 90 else 72 end,
      case when m.person_id is not null then '/network/contacts/'||m.person_id::text when m.organisation_id is not null then '/network/clubs/'||m.organisation_id::text else '/network' end,
      null,m.created_at
    from djm_os.meetings m
    left join djm_os.people p on p.id=m.person_id
    left join djm_os.organisations o on o.id=m.organisation_id
    where m.owner_user_id=v_uid and m.status not in ('cancelled','no_show') and m.starts_at>=now() and m.starts_at<now()+interval '7 days'

    union all

    select 'need',n.id,'Club need · '||coalesce(n.position,n.title),
      o.name||case when not exists(select 1 from djm_os.player_matches pm where pm.club_need_id=n.id and pm.status not in ('dismissed','rejected')) then ' · No signed-player match yet' else '' end,
      coalesce(n.updated_at,n.created_at),
      case when not exists(select 1 from djm_os.player_matches pm where pm.club_need_id=n.id and pm.status not in ('dismissed','rejected')) then 76 else 58 end,
      '/market',null,n.created_at
    from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id
    where n.status in ('active','open','confirmed')

    union all

    select 'deal',d.id,'Deal · '||d.title,
      concat_ws(' · ',nullif(o.name,''),replace(coalesce(d.stage,''),'_',' '),case when d.primary_blocker is not null then 'Blocker: '||d.primary_blocker else null end),
      d.next_action_at,
      least(100,70+coalesce(d.probability,30)/4+case when d.next_action_at<now() then 10 else 0 end)::int,
      '/market/deals/'||d.id::text,null,d.created_at
    from djm_os.deal_rooms d left join djm_os.organisations o on o.id=d.organisation_id
    where d.status='active'
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.score desc,x.action_at asc nulls last,x.created_at desc),'[]'::jsonb)
  into v_focus
  from (select * from focus_items order by score desc,action_at asc nulls last,created_at desc limit 16) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.top_match_score desc nulls last,x.updated_at desc),'[]'::jsonb)
  into v_opportunities
  from (
    select n.id,n.title,n.position,n.organisation_id,o.name organisation_name,n.updated_at,
      count(pm.id) filter(where pm.status not in ('dismissed','rejected')) match_count,
      max(pm.overall_score) filter(where pm.status not in ('dismissed','rejected')) top_match_score
    from djm_os.club_needs n
    join djm_os.organisations o on o.id=n.organisation_id
    left join djm_os.player_matches pm on pm.club_need_id=n.id
    where n.status in ('active','open','confirmed')
    group by n.id,o.name
    order by max(pm.overall_score) filter(where pm.status not in ('dismissed','rejected')) desc nulls last,n.updated_at desc
    limit 10
  ) x;

  select jsonb_build_object(
    'contacts_missing_club',(select count(*) from djm_os.people p where coalesce(p.person_type,'club_contact')<>'player' and not exists(select 1 from djm_os.employments e where e.person_id=p.id and e.is_current=true)),
    'contacts_missing_role',(select count(*) from djm_os.people p where coalesce(p.person_type,'club_contact')<>'player' and exists(select 1 from djm_os.employments e where e.person_id=p.id and e.is_current=true and nullif(trim(coalesce(e.role_title,'')),'') is null)),
    'recruitment_missing_transfermarkt',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost') and nullif(trim(coalesce(sp.transfermarkt_url,'')),'') is null),
    'recruitment_missing_contact',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost') and nullif(trim(coalesce(sp.whatsapp,'')),'') is null and nullif(trim(coalesce(sp.email,'')),'') is null and nullif(trim(coalesce(sp.instagram_url,'')),'') is null),
    'open_reviews',(select count(*) from djm_os.review_items r where r.status='open'),
    'stale_needs',(select count(*) from djm_os.club_needs n where n.status in ('active','open','confirmed') and n.updated_at<now()-interval '21 days')
  ) into v_quality;

  return jsonb_build_object(
    'generated_at',now(),
    'summary',v_summary,
    'focus',v_focus,
    'opportunities',v_opportunities,
    'quality',v_quality,
    'automation',public.djm_automation_health()
  );
end;
$$;

revoke all on function public.djm_command_center() from public, anon;
grant execute on function public.djm_command_center() to authenticated, service_role;
