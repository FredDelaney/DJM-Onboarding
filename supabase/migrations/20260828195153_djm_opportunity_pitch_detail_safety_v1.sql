create or replace function public.djm_opportunity(p_opportunity_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return jsonb_build_object(
    'deal', (
      select to_jsonb(x) from (
        select d.*, o.name as organisation_name, o.country as organisation_country, o.website_url,
          o.linkedin_url as organisation_linkedin_url, o.instagram_url as organisation_instagram_url, o.transfermarkt_url as organisation_transfermarkt_url,
          pe.full_name as source_person_name, pe.linkedin_url as source_person_linkedin_url, pe.instagram_url as source_person_instagram_url,
          (select cm.value from djm_os.contact_methods cm where cm.person_id = pe.id and cm.channel = 'whatsapp' order by cm.is_primary desc limit 1) as source_person_whatsapp,
          (select cm.value from djm_os.contact_methods cm where cm.person_id = pe.id and cm.channel = 'email' order by cm.is_primary desc limit 1) as source_person_email,
          coalesce(nullif(p.preferred_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), sp.full_name) as player_name,
          p.current_club as player_current_club, p.current_country as player_current_country,
          p.transfermarkt_url as player_transfermarkt_url, p.stats_url as player_stats_url, p.instagram_url as player_instagram_url,
          sp.transfermarkt_url as prospect_transfermarkt_url, sp.wyscout_url as prospect_wyscout_url, sp.instagram_url as prospect_instagram_url,
          sp.current_club as prospect_current_club, sp.current_country as prospect_current_country,
          tm.display_name as owner_name, to_jsonb(n) as club_need
        from djm_os.deal_rooms d
        join djm_os.organisations o on o.id = d.organisation_id
        left join djm_os.people pe on pe.id = d.source_person_id
        left join public.players p on p.id = d.player_id
        left join djm_os.scouting_prospects sp on sp.id = d.prospect_id
        left join djm_os.team_members tm on tm.user_id = d.owner_user_id
        left join djm_os.club_needs n on n.id = d.club_need_id
        where d.id = p_opportunity_id
      ) x
    ),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.due_at nulls last)
      from (
        select id, title, due_at, status, priority from djm_os.tasks
        where club_need_id = (select club_need_id from djm_os.deal_rooms where id = p_opportunity_id)
          and status not in ('done', 'completed', 'cancelled')
      ) t
    ), '[]'::jsonb),
    'pitches', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from (
        select id, token, label, active, expires_at, view_count, last_viewed_at,
          pitch_message, pitch_status, selected_sections, sent_at, revoked_at, created_at
        from public.club_share_links where opportunity_id = p_opportunity_id
      ) s
    ), '[]'::jsonb)
  );
end; $$;

create or replace function public.djm_opportunity_update_identity(
  p_opportunity_id uuid,
  p_organisation_id uuid,
  p_source_person_id uuid default null,
  p_player_id uuid default null,
  p_prospect_id uuid default null,
  p_club_need_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before jsonb;
  v_before_player uuid;
  v_prediction jsonb;
  v_model smallint;
  v_manual smallint;
  v_effective smallint;
  v_stage text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_organisation_id is null or not exists(select 1 from djm_os.organisations where id=p_organisation_id and organisation_type='club') then raise exception 'Club is required'; end if;
  if num_nonnulls(p_player_id,p_prospect_id) <> 1 then raise exception 'Choose exactly one signed player or recruitment target'; end if;
  if p_source_person_id is not null and not exists(select 1 from djm_os.people where id=p_source_person_id) then raise exception 'Source contact not found'; end if;
  if p_club_need_id is not null and not exists(select 1 from djm_os.club_needs where id=p_club_need_id and organisation_id=p_organisation_id) then raise exception 'Club Need must belong to the selected club'; end if;

  select to_jsonb(d),d.player_id,d.stage,d.manual_probability into v_before,v_before_player,v_stage,v_manual from djm_os.deal_rooms d where d.id=p_opportunity_id;
  if v_before is null then raise exception 'Opportunity not found'; end if;
  if exists(select 1 from public.club_share_links s where s.opportunity_id=p_opportunity_id and s.active=true)
     and p_player_id is distinct from v_before_player then
    raise exception 'Revoke active pitch links before changing the pitched player';
  end if;

  v_prediction:=public.djm_opportunity_probability(p_club_need_id,p_player_id,p_prospect_id,v_stage,null,null);
  v_model:=(v_prediction->>'probability')::smallint;
  v_effective:=coalesce(v_manual,v_model);

  update djm_os.deal_rooms set
    organisation_id=p_organisation_id,
    source_person_id=p_source_person_id,
    player_id=p_player_id,
    prospect_id=p_prospect_id,
    club_need_id=p_club_need_id,
    model_probability=v_model,
    probability=v_effective,
    probability_source=case when v_manual is null then 'model' else 'manual' end,
    probability_basis=v_prediction,
    last_meaningful_at=now(),
    updated_at=now()
  where id=p_opportunity_id;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,person_id,player_id,payload,source,confidence,occurred_at)
  values('OPPORTUNITY_IDENTITY_UPDATED',auth.uid(),p_organisation_id,p_source_person_id,p_player_id,
    jsonb_build_object('opportunity_id',p_opportunity_id,'before',v_before,'organisation_id',p_organisation_id,'source_person_id',p_source_person_id,'player_id',p_player_id,'prospect_id',p_prospect_id,'club_need_id',p_club_need_id,'model_probability',v_model,'effective_probability',v_effective),
    'manual_ui',1,now());

  return jsonb_build_object('opportunity_id',p_opportunity_id,'model_probability',v_model,'probability',v_effective,'probability_source',case when v_manual is null then 'model' else 'manual' end);
end; $$;

revoke all on function public.djm_opportunity(uuid) from public,anon;
revoke all on function public.djm_opportunity_update_identity(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.djm_opportunity(uuid) to authenticated,service_role;
grant execute on function public.djm_opportunity_update_identity(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
