-- Keep all onboarding writes under the browser caller's RLS and protected-field triggers.
-- Only the private boolean lookup crosses into the unexposed platform schema.
create or replace function private.player_owns_active_workspace(p_player_id uuid,p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null and exists(
  select 1 from public.players p join platform.tenants t on t.id=p.tenant_id
  where p.id=p_player_id and p.tenant_id=p_tenant_id and p.user_id=auth.uid()
   and p.archived_at is null and coalesce(p.football_status,'active')<>'retired'
   and t.status='active'
 );
$$;
revoke all on function private.player_owns_active_workspace(uuid,uuid) from public,anon;
grant execute on function private.player_owns_active_workspace(uuid,uuid) to authenticated;

create or replace function public.player_save_onboarding(
 p_player_id uuid,p_tenant_id uuid,p_profile jsonb,p_private jsonb,
 p_next_step integer,p_video_url text,p_finishing boolean,p_expected_updated_at timestamptz,p_expected_private_updated_at timestamptz
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
 v_player public.players%rowtype;
 v_profile public.players%rowtype;
 v_private public.player_private%rowtype;
 v_version timestamptz;
 v_private_version timestamptz;
 v_video text:=nullif(trim(p_video_url),'');
 v_url text;
begin
 if not private.player_owns_active_workspace(p_player_id,p_tenant_id) then
  raise exception 'player_workspace_not_found' using errcode='42501';
 end if;
 select p.* into v_player from public.players p
 where p.id=p_player_id and p.tenant_id=p_tenant_id and p.user_id=auth.uid() for update;
 if not found or v_player.archived_at is not null or coalesce(v_player.football_status,'active')='retired' then
  raise exception 'player_workspace_not_found' using errcode='42501';
 end if;
 if jsonb_typeof(p_profile) is distinct from 'object' or jsonb_typeof(p_private) is distinct from 'object'
    or p_finishing is null or octet_length(p_profile::text)+octet_length(p_private::text)>30000 then
  raise exception 'invalid_onboarding_payload' using errcode='22023';
 end if;
 if p_next_step is null or p_next_step not between 1 and 4 or (p_finishing and p_next_step<>4) then
  raise exception 'invalid_onboarding_step' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_object_keys(p_profile) k where k<>all(array[
  'first_name','last_name','preferred_name','date_of_birth','nationalities','height_cm','preferred_foot',
  'primary_position','secondary_positions','current_club','current_league','current_country',
  'contract_status','contract_expiry','transfermarkt_url','wyscout_url','stats_url','instagram_url'
 ])) or exists(select 1 from jsonb_object_keys(p_private) k where k<>all(array[
  'phone','whatsapp','residence_country','passports_held','work_rights','market_preferences',
  'relocation_preferences','preferred_move_timing','salary_expectation','travel_availability'
 ])) then raise exception 'onboarding_field_not_allowed' using errcode='22023'; end if;
 -- A response lost after commit can be retried. A late draft must never reopen or overwrite completion.
 if v_player.onboarding_status in ('submitted','verified','complete') then
  return jsonb_build_object('saved',true,'completed',true,'updated_at',v_player.updated_at);
 end if;
 if p_expected_updated_at is distinct from v_player.updated_at then
  raise exception 'onboarding_changed' using errcode='40001';
 end if;
 v_profile:=jsonb_populate_record(v_player,p_profile);
 select pp.* into v_private from public.player_private pp where pp.player_id=p_player_id for update;
 if p_expected_private_updated_at is distinct from v_private.updated_at then
  raise exception 'onboarding_changed' using errcode='40001';
 end if;
 v_private:=jsonb_populate_record(v_private,p_private);
 if v_profile.date_of_birth>current_date then raise exception 'invalid_onboarding_birth_date' using errcode='22023'; end if;
 if v_profile.height_cm is not null and v_profile.height_cm not between 140 and 230 then
  raise exception 'invalid_onboarding_height' using errcode='22023';
 end if;
 foreach v_url in array array[v_profile.transfermarkt_url,v_profile.wyscout_url,v_profile.stats_url,v_video] loop
  if nullif(trim(v_url),'') is not null and (length(v_url)>2048 or v_url !~* '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$') then
   raise exception 'invalid_onboarding_url' using errcode='22023';
  end if;
 end loop;
 if p_finishing and (nullif(trim(v_profile.first_name),'') is null or nullif(trim(v_profile.last_name),'') is null
   or nullif(trim(v_profile.primary_position),'') is null or nullif(trim(v_profile.preferred_foot),'') is null) then
  raise exception 'onboarding_required_fields' using errcode='22023';
 end if;
 update public.players set
  first_name=v_profile.first_name,last_name=v_profile.last_name,preferred_name=v_profile.preferred_name,
  date_of_birth=v_profile.date_of_birth,nationalities=coalesce(v_profile.nationalities,'{}'),height_cm=v_profile.height_cm,
  preferred_foot=v_profile.preferred_foot,primary_position=v_profile.primary_position,secondary_positions=coalesce(v_profile.secondary_positions,'{}'),
  current_club=v_profile.current_club,current_league=v_profile.current_league,current_country=v_profile.current_country,
  contract_status=v_profile.contract_status,contract_expiry=v_profile.contract_expiry,
  transfermarkt_url=v_profile.transfermarkt_url,wyscout_url=v_profile.wyscout_url,stats_url=v_profile.stats_url,instagram_url=v_profile.instagram_url,
  onboarding_status=case when p_finishing then 'submitted' else 'in_progress' end,updated_at=clock_timestamp()
 where id=p_player_id returning updated_at into v_version;
 if not found then raise exception 'player_workspace_not_found' using errcode='42501'; end if;
 insert into public.player_private(player_id,phone,whatsapp,residence_country,passports_held,work_rights,market_preferences,
  relocation_preferences,preferred_move_timing,salary_expectation,travel_availability)
 values(p_player_id,v_private.phone,v_private.whatsapp,v_private.residence_country,coalesce(v_private.passports_held,'{}'),
  v_private.work_rights,v_private.market_preferences,v_private.relocation_preferences,v_private.preferred_move_timing,v_private.salary_expectation,v_private.travel_availability)
 on conflict(player_id) do update set phone=excluded.phone,whatsapp=excluded.whatsapp,residence_country=excluded.residence_country,
  passports_held=excluded.passports_held,work_rights=excluded.work_rights,market_preferences=excluded.market_preferences,
  relocation_preferences=excluded.relocation_preferences,preferred_move_timing=excluded.preferred_move_timing,
  salary_expectation=excluded.salary_expectation,travel_availability=excluded.travel_availability,updated_at=clock_timestamp()
 where public.player_private.updated_at is not distinct from p_expected_private_updated_at
 returning updated_at into v_private_version;
 if not found then raise exception 'onboarding_changed' using errcode='40001'; end if;
 insert into public.player_onboarding(player_id,current_step,draft,draft_state,completed_at,submitted_at)
 values(p_player_id,p_next_step,jsonb_build_object('step',p_next_step-1,'video_url',v_video),
  jsonb_build_object('step',p_next_step-1,'video_url',v_video),
  case when p_finishing then now() end,case when p_finishing then now() end)
 on conflict(player_id) do update set current_step=excluded.current_step,
  draft=public.player_onboarding.draft||excluded.draft,draft_state=public.player_onboarding.draft_state||excluded.draft_state,
  completed_at=coalesce(public.player_onboarding.completed_at,excluded.completed_at),
  submitted_at=coalesce(public.player_onboarding.submitted_at,excluded.submitted_at);
 if p_finishing and v_video is not null then
  insert into public.player_videos(player_id,title,url,video_type,featured)
  select p_player_id,'Player highlight video',v_video,'highlight',true
  where not exists(select 1 from public.player_videos pv where pv.player_id=p_player_id and pv.url=v_video);
 end if;
 return jsonb_build_object('saved',true,'completed',p_finishing,'updated_at',v_version,'private_updated_at',v_private_version);
end;
$$;
revoke all on function public.player_save_onboarding(uuid,uuid,jsonb,jsonb,integer,text,boolean,timestamptz,timestamptz) from public,anon;
grant execute on function public.player_save_onboarding(uuid,uuid,jsonb,jsonb,integer,text,boolean,timestamptz,timestamptz) to authenticated;
