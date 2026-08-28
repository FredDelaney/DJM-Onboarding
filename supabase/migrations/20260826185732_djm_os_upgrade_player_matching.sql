create or replace function djm_os.has_eu_passport(p_passports text[])
returns boolean language sql immutable as $$
select exists(select 1 from unnest(coalesce(p_passports,'{}'::text[])) x where lower(x) in ('austria','belgium','bulgaria','croatia','cyprus','czech republic','czechia','denmark','estonia','finland','france','germany','greece','hungary','ireland','italy','latvia','lithuania','luxembourg','malta','netherlands','poland','portugal','romania','slovakia','slovenia','spain','sweden'))
$$;

create or replace function djm_os.market_preference_score(p_preferences text,p_country text)
returns numeric language sql immutable as $$
select case
  when nullif(trim(coalesce(p_country,'')),'') is null then 65
  when nullif(trim(coalesce(p_preferences,'')),'') is null then 60
  when lower(p_preferences) like '%'||lower(p_country)||'%' and lower(p_preferences) !~ ('(not|no|avoid|exclude)[^,.]{0,20}'||lower(p_country)) then 95
  when lower(p_preferences) ~ '(open|anywhere|worldwide|global|europe|asia|scandinavia)' then 78
  when lower(p_preferences) ~ ('(not|no|avoid|exclude)[^,.]{0,20}'||lower(p_country)) then 20
  else 60 end
$$;

create or replace function djm_os.registration_fit_score(p_registration_notes text,p_work_rights text,p_passports text[],p_country text)
returns numeric language sql immutable as $$
select case
  when nullif(trim(coalesce(p_registration_notes,'')),'') is null then
    case when p_country is not null and lower(coalesce(p_work_rights,'')) like '%'||lower(p_country)||'%' then 95 else 70 end
  when lower(p_registration_notes) ~ '(eu passport|eu national|european passport)' then case when djm_os.has_eu_passport(p_passports) then 100 else 35 end
  when p_country is not null and lower(coalesce(p_work_rights,'')) like '%'||lower(p_country)||'%' then 95
  else 65 end
$$;

create or replace function djm_os.refresh_need_matches(p_need_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare n djm_os.club_needs%rowtype; v_country text;
begin
  select * into n from djm_os.club_needs where id=p_need_id; if not found then return; end if;
  select country into v_country from djm_os.organisations where id=n.organisation_id;
  if n.status not in ('active','open','confirmed') then delete from djm_os.player_matches where club_need_id=p_need_id and status='suggested'; return; end if;
  delete from djm_os.player_matches m using public.players p
  where m.club_need_id=p_need_id and m.player_id=p.id and m.status='suggested'
    and not (djm_os.position_matches_player(n.position,p.primary_position,p.secondary_positions)
      and (n.preferred_foot is null or lower(coalesce(p.preferred_foot,''))=lower(n.preferred_foot))
      and (n.min_age is null or p.date_of_birth is null or date_part('year',age(current_date,p.date_of_birth))>=n.min_age)
      and (n.max_age is null or p.date_of_birth is null or date_part('year',age(current_date,p.date_of_birth))<=n.max_age));

  insert into djm_os.player_matches(club_need_id,player_id,overall_score,football_score,commercial_score,registration_score,career_score,access_score,reasoning,status)
  select n.id,p.id,
    round((football_score*0.50 + commercial_score*0.10 + registration_score*0.15 + career_score*0.20 + availability_score*0.05)::numeric,1),
    football_score,commercial_score,registration_score,career_score,null::numeric,
    jsonb_build_object('position_match',true,'foot_match',case when n.preferred_foot is null then null else lower(coalesce(p.preferred_foot,''))=lower(n.preferred_foot) end,'age',case when p.date_of_birth is null then null else date_part('year',age(current_date,p.date_of_birth))::int end,'club_country',v_country,'market_preferences',f.market_preferences,'passports',f.passports_held,'work_rights',f.work_rights,'availability_status',p.football_status,'source','automatic_player_market_fit_v2'),
    'suggested'
  from public.players p
  left join djm_os.player_market_facts f on f.player_id=p.id
  cross join lateral (
    select
      least(100,70 + case when n.preferred_foot is null then 5 else 10 end + case when n.min_age is null and n.max_age is null then 5 else 10 end)::numeric football_score,
      case when nullif(trim(coalesce(f.salary_expectation,'')),'') is null or n.salary_budget is null then 60 else 55 end::numeric commercial_score,
      djm_os.registration_fit_score(n.registration_notes,f.work_rights,f.passports_held,v_country)::numeric registration_score,
      djm_os.market_preference_score(f.market_preferences,v_country)::numeric career_score,
      case when lower(coalesce(p.football_status,'')) in ('free_agent','free agent','loan') then 95 when lower(coalesce(p.football_status,''))='active' then 80 when lower(coalesce(p.football_status,''))='injured' then 35 else 60 end::numeric availability_score
  ) s
  where djm_os.position_matches_player(n.position,p.primary_position,p.secondary_positions)
    and (n.preferred_foot is null or lower(coalesce(p.preferred_foot,''))=lower(n.preferred_foot))
    and (n.min_age is null or p.date_of_birth is null or date_part('year',age(current_date,p.date_of_birth))>=n.min_age)
    and (n.max_age is null or p.date_of_birth is null or date_part('year',age(current_date,p.date_of_birth))<=n.max_age)
  on conflict(club_need_id,player_id) do update set overall_score=excluded.overall_score,football_score=excluded.football_score,commercial_score=excluded.commercial_score,registration_score=excluded.registration_score,career_score=excluded.career_score,reasoning=excluded.reasoning,updated_at=now() where djm_os.player_matches.status='suggested';
end $$;

create or replace function djm_os.sync_player_private_trigger()
returns trigger language plpgsql security definer set search_path=public,djm_os as $$
declare n record;
begin
  insert into djm_os.player_market_facts(player_id,market_preferences,relocation_preferences,salary_expectation,travel_availability,passports_held,work_rights,preferred_move_timing,last_synced_at)
  values(new.player_id,new.market_preferences,new.relocation_preferences,new.salary_expectation,new.travel_availability,coalesce(new.passports_held,'{}'),new.work_rights,new.preferred_move_timing,now())
  on conflict(player_id) do update set market_preferences=excluded.market_preferences,relocation_preferences=excluded.relocation_preferences,salary_expectation=excluded.salary_expectation,travel_availability=excluded.travel_availability,passports_held=excluded.passports_held,work_rights=excluded.work_rights,preferred_move_timing=excluded.preferred_move_timing,last_synced_at=now();
  insert into djm_os.events(event_type,player_id,payload,source,occurred_at) values('PLAYER_MARKET_PREFERENCES_CHANGED',new.player_id,jsonb_build_object('market_preferences',new.market_preferences,'relocation_preferences',new.relocation_preferences,'salary_expectation',new.salary_expectation,'preferred_move_timing',new.preferred_move_timing,'passports_held',new.passports_held,'work_rights',new.work_rights),'djm_player',now());
  for n in select id from djm_os.club_needs where status in ('active','open','confirmed') loop perform djm_os.refresh_need_matches(n.id); end loop;
  return new;
end $$;
