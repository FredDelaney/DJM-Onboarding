create table if not exists djm_os.player_market_facts (
  player_id uuid primary key references public.players(id) on delete cascade,
  market_preferences text,
  relocation_preferences text,
  salary_expectation text,
  travel_availability text,
  passports_held text[] not null default '{}',
  work_rights text,
  preferred_move_timing text,
  last_synced_at timestamptz not null default now()
);
alter table djm_os.player_market_facts enable row level security;
drop policy if exists djm_team_select on djm_os.player_market_facts;
create policy djm_team_select on djm_os.player_market_facts for select to authenticated using (exists (select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active));

grant select on djm_os.player_market_facts to authenticated;

create or replace function public.djm_sync_player_market_fact(p_player_id uuid)
returns void language plpgsql security invoker set search_path=public,djm_os as $$
begin
  if not exists (select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) and auth.uid() is not null then
    raise exception 'DJM team access required';
  end if;
  insert into djm_os.player_market_facts(player_id,market_preferences,relocation_preferences,salary_expectation,travel_availability,passports_held,work_rights,preferred_move_timing,last_synced_at)
  select p.id, pp.market_preferences, pp.relocation_preferences, pp.salary_expectation, pp.travel_availability, coalesce(pp.passports_held,'{}'), pp.work_rights, pp.preferred_move_timing, now()
  from public.players p left join public.player_private pp on pp.player_id=p.id where p.id=p_player_id
  on conflict(player_id) do update set market_preferences=excluded.market_preferences,relocation_preferences=excluded.relocation_preferences,salary_expectation=excluded.salary_expectation,travel_availability=excluded.travel_availability,passports_held=excluded.passports_held,work_rights=excluded.work_rights,preferred_move_timing=excluded.preferred_move_timing,last_synced_at=now();
end $$;
revoke all on function public.djm_sync_player_market_fact(uuid) from public, anon;
grant execute on function public.djm_sync_player_market_fact(uuid) to authenticated, service_role;

create or replace function djm_os.sync_player_private_trigger()
returns trigger language plpgsql security definer set search_path=public,djm_os as $$
begin
  insert into djm_os.player_market_facts(player_id,market_preferences,relocation_preferences,salary_expectation,travel_availability,passports_held,work_rights,preferred_move_timing,last_synced_at)
  values(new.player_id,new.market_preferences,new.relocation_preferences,new.salary_expectation,new.travel_availability,coalesce(new.passports_held,'{}'),new.work_rights,new.preferred_move_timing,now())
  on conflict(player_id) do update set market_preferences=excluded.market_preferences,relocation_preferences=excluded.relocation_preferences,salary_expectation=excluded.salary_expectation,travel_availability=excluded.travel_availability,passports_held=excluded.passports_held,work_rights=excluded.work_rights,preferred_move_timing=excluded.preferred_move_timing,last_synced_at=now();
  insert into djm_os.events(event_type,player_id,payload,source,occurred_at) values('PLAYER_MARKET_PREFERENCES_CHANGED',new.player_id,jsonb_build_object('market_preferences',new.market_preferences,'relocation_preferences',new.relocation_preferences,'salary_expectation',new.salary_expectation,'preferred_move_timing',new.preferred_move_timing),'djm_player',now());
  return new;
end $$;
drop trigger if exists trg_djm_player_private_sync on public.player_private;
create trigger trg_djm_player_private_sync after insert or update of market_preferences,relocation_preferences,salary_expectation,travel_availability,passports_held,work_rights,preferred_move_timing on public.player_private for each row execute function djm_os.sync_player_private_trigger();

create or replace function djm_os.ensure_organisation(p_name text,p_country text default null)
returns uuid language plpgsql security definer set search_path=djm_os,public as $$
declare v_id uuid; v_key text;
begin
  if nullif(trim(p_name),'') is null then return null; end if;
  v_key:=lower(regexp_replace(trim(p_name),'[^a-z0-9]+','','g'));
  select id into v_id from djm_os.organisations where canonical_key=v_key limit 1;
  if v_id is null then
    insert into djm_os.organisations(name,organisation_type,country,canonical_key,last_verified_at) values(trim(p_name),'club',nullif(trim(p_country),''),v_key,now()) returning id into v_id;
  else
    update djm_os.organisations set country=coalesce(country,nullif(trim(p_country),'')),updated_at=now() where id=v_id;
  end if;
  return v_id;
end $$;

create or replace function public.djm_bootstrap_from_player_app()
returns jsonb language plpgsql security invoker set search_path=public,djm_os as $$
declare r record; v_org uuid; v_orgs int:=0; v_facts int:=0; v_links int:=0;
begin
  if not exists (select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  for r in select id,current_club,current_country from public.players where nullif(trim(current_club),'') is not null loop
    v_org:=djm_os.ensure_organisation(r.current_club,r.current_country); v_orgs:=v_orgs+1;
  end loop;
  for r in select club_name,country from public.career_entries where nullif(trim(club_name),'') is not null loop
    perform djm_os.ensure_organisation(r.club_name,r.country); v_orgs:=v_orgs+1;
  end loop;
  for r in select id,player_id,club_name,country,contact_name,contact_role from public.player_opportunities loop
    v_org:=djm_os.ensure_organisation(r.club_name,r.country);
    insert into djm_os.opportunity_links(opportunity_id,organisation_id,linked_by,created_at)
    values(r.id,v_org,(select tm.user_id from djm_os.team_members tm where tm.is_active order by case when tm.user_id=(select auth.uid()) then 0 else 1 end limit 1),now())
    on conflict(opportunity_id) do update set organisation_id=excluded.organisation_id;
    v_links:=v_links+1;
  end loop;
  insert into djm_os.player_market_facts(player_id,market_preferences,relocation_preferences,salary_expectation,travel_availability,passports_held,work_rights,preferred_move_timing,last_synced_at)
  select p.id,pp.market_preferences,pp.relocation_preferences,pp.salary_expectation,pp.travel_availability,coalesce(pp.passports_held,'{}'),pp.work_rights,pp.preferred_move_timing,now()
  from public.players p left join public.player_private pp on pp.player_id=p.id
  on conflict(player_id) do update set market_preferences=excluded.market_preferences,relocation_preferences=excluded.relocation_preferences,salary_expectation=excluded.salary_expectation,travel_availability=excluded.travel_availability,passports_held=excluded.passports_held,work_rights=excluded.work_rights,preferred_move_timing=excluded.preferred_move_timing,last_synced_at=now();
  get diagnostics v_facts=row_count;
  return jsonb_build_object('organisation_inputs_processed',v_orgs,'player_market_facts_synced',v_facts,'opportunities_linked',v_links);
end $$;
revoke all on function public.djm_bootstrap_from_player_app() from public,anon;
grant execute on function public.djm_bootstrap_from_player_app() to authenticated;
