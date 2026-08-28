create or replace function public.djm_home()
returns jsonb language sql stable set search_path='' as $$
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
$$;
grant execute on function public.djm_home() to authenticated;

select cron.schedule('djm-os-relationship-graph','41 2 * * *','select djm_os.refresh_relationship_graph();')
where not exists(select 1 from cron.job where jobname='djm-os-relationship-graph');

select djm_os.refresh_relationship_graph();
