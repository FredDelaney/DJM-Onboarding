create or replace function public.djm_market_create_need(
  p_organisation_id uuid,
  p_title text,
  p_position text,
  p_source_person_id uuid default null,
  p_preferred_foot text default null,
  p_min_age smallint default null,
  p_max_age smallint default null,
  p_transfer_type text default null,
  p_transfer_budget numeric default null,
  p_salary_budget numeric default null,
  p_currency text default null,
  p_salary_period text default null,
  p_profile_notes text default null,
  p_registration_notes text default null,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
set search_path to ''
as $function$
declare v_id uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_organisation_id is null then raise exception 'Club is required'; end if;
  if p_position is null or length(trim(p_position))<1 then raise exception 'Position is required'; end if;
  if p_min_age is not null and p_max_age is not null and p_min_age>p_max_age then raise exception 'Minimum age cannot exceed maximum age'; end if;

  insert into djm_os.club_needs(
    organisation_id,source_person_id,owner_user_id,title,position,preferred_foot,min_age,max_age,
    transfer_type,transfer_budget,salary_budget,currency,salary_period,profile_notes,registration_notes,
    status,confidence,confirmed_at,expires_at
  ) values(
    p_organisation_id,p_source_person_id,auth.uid(),coalesce(nullif(trim(p_title),''),trim(p_position)||' requirement'),
    trim(p_position),nullif(trim(p_preferred_foot),''),p_min_age,p_max_age,nullif(trim(p_transfer_type),''),
    p_transfer_budget,p_salary_budget,nullif(trim(p_currency),''),nullif(trim(p_salary_period),''),
    nullif(trim(p_profile_notes),''),nullif(trim(p_registration_notes),''),'active',1,now(),
    coalesce(p_expires_at,now()+interval '45 days')
  ) returning id into v_id;

  insert into djm_os.events(
    event_type,actor_user_id,organisation_id,person_id,payload,source,confidence,occurred_at
  ) values(
    'CLUB_NEED_CREATED',auth.uid(),p_organisation_id,p_source_person_id,
    jsonb_build_object('club_need_id',v_id,'position',trim(p_position),'title',coalesce(nullif(trim(p_title),''),trim(p_position)||' requirement')),
    'market',1,now()
  );

  return jsonb_build_object('need_id',v_id);
end
$function$;

create or replace function public.djm_market_set_need_status(p_need_id uuid, p_status text)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare v_status text; v_org uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  v_status:=lower(trim(coalesce(p_status,'')));
  if v_status not in ('active','open','confirmed','stale','filled','closed','cancelled') then raise exception 'Invalid club need status'; end if;

  update djm_os.club_needs
  set status=v_status,updated_at=now(),
      confirmed_at=case when v_status in ('active','open','confirmed') then coalesce(confirmed_at,now()) else confirmed_at end
  where id=p_need_id
  returning organisation_id into v_org;

  if not found then raise exception 'Club need not found'; end if;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  values(
    'CLUB_NEED_STATUS_CHANGED',auth.uid(),v_org,
    jsonb_build_object('club_need_id',p_need_id,'status',v_status),
    'market',1,now()
  );

  return jsonb_build_object('need_id',p_need_id,'status',v_status);
end
$function$;

create or replace function public.djm_market_set_match_status(p_match_id uuid, p_status text)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare v_status text; v_need uuid; v_player uuid; v_org uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  v_status:=lower(trim(coalesce(p_status,'')));
  if v_status not in ('suggested','reviewing','contacted','available','presented','interested','rejected','negotiating','placed','dismissed') then raise exception 'Invalid match status'; end if;

  update djm_os.player_matches
  set status=v_status,updated_at=now()
  where id=p_match_id
  returning club_need_id,player_id into v_need,v_player;

  if not found then raise exception 'Player match not found'; end if;
  select organisation_id into v_org from djm_os.club_needs where id=v_need;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,player_id,payload,source,confidence,occurred_at)
  values(
    'PLAYER_MATCH_STATUS_CHANGED',auth.uid(),v_org,v_player,
    jsonb_build_object('club_need_id',v_need,'match_id',p_match_id,'status',v_status),
    'market',1,now()
  );

  return jsonb_build_object('match_id',p_match_id,'status',v_status);
end
$function$;
