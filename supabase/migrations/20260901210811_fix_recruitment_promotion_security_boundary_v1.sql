create or replace function public.djm_recruitment_promote_to_signed_player(p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  sp djm_os.scouting_prospects%rowtype;
  v_player_id uuid;
  v_first text;
  v_last text;
  v_space int;
begin
  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id=(select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  select * into sp
  from djm_os.scouting_prospects
  where id=p_prospect_id
  for update;

  if sp.id is null then raise exception 'Recruitment target not found'; end if;
  if sp.signed_player_id is not null then
    return jsonb_build_object('player_id',sp.signed_player_id,'already_promoted',true);
  end if;
  if sp.recruitment_stage <> 'signed' then
    raise exception 'Target must be marked signed before promotion';
  end if;

  v_space := strpos(trim(sp.full_name),' ');
  if v_space > 0 then
    v_first := left(trim(sp.full_name),v_space-1);
    v_last := substr(trim(sp.full_name),v_space+1);
  else
    v_first := trim(sp.full_name);
    v_last := null;
  end if;

  insert into public.players(
    first_name,last_name,date_of_birth,nationalities,preferred_foot,primary_position,
    secondary_positions,current_club,current_country,contract_expiry,transfermarkt_url,
    wyscout_url,instagram_url,onboarding_status,verification_status,agency_priority,
    next_action,review_required_at,review_reason
  ) values (
    v_first,v_last,sp.date_of_birth,
    case when nullif(trim(coalesce(sp.nationality,'')),'') is null then '{}'::text[] else array[trim(sp.nationality)] end,
    sp.preferred_foot,sp.primary_position,coalesce(sp.secondary_positions,'{}'::text[]),
    sp.current_club,sp.current_country,sp.contract_expiry,sp.transfermarkt_url,sp.wyscout_url,
    sp.instagram_url,'not_started','unverified','high','Complete DJM Player onboarding',now(),
    'Promoted from DJM Recruitment after signing'
  ) returning id into v_player_id;

  delete from djm_os.football_intelligence_subjects created
  where created.player_id=v_player_id
    and created.prospect_id is null
    and exists (
      select 1 from djm_os.football_intelligence_subjects existing
      where existing.prospect_id=p_prospect_id
        and existing.id <> created.id
    );

  update djm_os.scouting_prospects
  set signed_player_id=v_player_id,
      linked_player_id=v_player_id,
      signed_at=coalesce(signed_at,now()),
      next_action_at=null,
      updated_at=now()
  where id=p_prospect_id;

  update djm_os.tasks
  set status='completed',completed_at=now(),updated_at=now()
  where source=('recruitment:'||p_prospect_id::text)
    and status not in ('completed','cancelled');

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values(
    'RECRUITMENT_PROMOTED_TO_SIGNED_PLAYER',(select auth.uid()),v_player_id,
    jsonb_build_object('prospect_id',p_prospect_id,'player_name',sp.full_name),
    'recruitment',1,now()
  );

  return jsonb_build_object(
    'player_id',v_player_id,
    'prospect_id',p_prospect_id,
    'already_promoted',false,
    'onboarding_status','not_started'
  );
end;
$$;

revoke all on function public.djm_recruitment_promote_to_signed_player(uuid) from public,anon;
grant execute on function public.djm_recruitment_promote_to_signed_player(uuid) to authenticated,service_role;
