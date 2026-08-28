create or replace function public.djm_operating_home()
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;
  return jsonb_build_object(
    'network',jsonb_build_object(
      'clubs',(select count(*) from djm_os.organisations where organisation_type='club'),
      'club_contacts',(select count(*) from djm_os.people where coalesce(person_type,'club_contact')<>'player' and exists(select 1 from djm_os.employments e where e.person_id=people.id and e.is_current=true)),
      'open_commitments',(select count(*) from djm_os.tasks where owner_user_id=v_uid and status not in ('completed','cancelled')),
      'reviews',(select count(*) from djm_os.review_items where status='open')
    ),
    'recruitment',coalesce(public.djm_recruitment_dashboard(),'{}'::jsonb),
    'market',jsonb_build_object(
      'active_needs',(select count(*) from djm_os.club_needs where status in ('active','open','confirmed')),
      'strong_matches',(select count(*) from djm_os.player_matches where status not in ('dismissed','rejected') and overall_score>=80),
      'needs_without_matches',(select count(*) from djm_os.club_needs n where n.status in ('active','open','confirmed') and not exists(select 1 from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')))
    ),
    'top_actions',coalesce((select jsonb_agg(to_jsonb(x) order by x.rank_score desc,x.due_at nulls last) from (
      select 'task'::text as item_type,t.id,t.title,coalesce(t.due_at,now()+interval '365 days') as due_at,
        least(100,50 + case when t.due_at<now() then 30 else 0 end + t.priority*4)::int as rank_score,
        t.person_id,t.organisation_id,null::uuid as prospect_id
      from djm_os.tasks t where t.owner_user_id=v_uid and t.status not in ('completed','cancelled')
      union all
      select 'recruitment'::text,sp.id,'Recruitment: '||sp.full_name,coalesce(sp.next_action_at,now()+interval '365 days'),
        least(100,sp.recruitment_priority*15 + case when sp.next_action_at<now() then 20 else 0 end + case when sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating') then 20 else 0 end)::int,
        null::uuid,null::uuid,sp.id
      from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.owner_user_id=v_uid and sp.recruitment_stage not in ('signed','declined','lost','paused')
      order by rank_score desc,due_at nulls last limit 12
    ) x),'[]'::jsonb)
  );
end $$;
