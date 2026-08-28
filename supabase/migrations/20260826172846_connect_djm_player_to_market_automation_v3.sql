create or replace function djm_os.position_matches_player(p_need_position text, p_primary text, p_secondary text[])
returns boolean
language sql immutable security invoker set search_path = ''
as $$
  select case
    when p_need_position is null or trim(p_need_position) = '' then true
    when upper(trim(p_need_position)) = 'ST' then lower(coalesce(p_primary,'')) ~ '(striker|centre forward|center forward|forward|cf|st)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(striker|centre forward|center forward|forward|cf|st)')
    when upper(trim(p_need_position)) = 'LCB' then lower(coalesce(p_primary,'')) ~ '(centre back|center back|central defender|cb|lcb)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(centre back|center back|central defender|cb|lcb)')
    when upper(trim(p_need_position)) = 'CB' then lower(coalesce(p_primary,'')) ~ '(centre back|center back|central defender|cb)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(centre back|center back|central defender|cb)')
    when upper(trim(p_need_position)) = 'LB' then lower(coalesce(p_primary,'')) ~ '(left back|left-back|lb|wing back)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(left back|left-back|lb|wing back)')
    when upper(trim(p_need_position)) = 'RB' then lower(coalesce(p_primary,'')) ~ '(right back|right-back|rb|wing back)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(right back|right-back|rb|wing back)')
    when upper(trim(p_need_position)) = 'RW' then lower(coalesce(p_primary,'')) ~ '(right wing|right winger|rw|winger)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(right wing|right winger|rw|winger)')
    when upper(trim(p_need_position)) = 'LW' then lower(coalesce(p_primary,'')) ~ '(left wing|left winger|lw|winger)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(left wing|left winger|lw|winger)')
    when upper(trim(p_need_position)) = 'WINGER' then lower(coalesce(p_primary,'')) ~ '(wing|winger|rw|lw)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(wing|winger|rw|lw)')
    when trim(p_need_position) = '6' then lower(coalesce(p_primary,'')) ~ '(defensive midfield|holding midfield|dm|number 6|no. 6)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(defensive midfield|holding midfield|dm|number 6|no. 6)')
    when trim(p_need_position) = '8' then lower(coalesce(p_primary,'')) ~ '(central midfield|centre midfield|cm|number 8|no. 8|box.to.box)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(central midfield|centre midfield|cm|number 8|no. 8|box.to.box)')
    when trim(p_need_position) = '10' then lower(coalesce(p_primary,'')) ~ '(attacking midfield|am|number 10|no. 10)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(attacking midfield|am|number 10|no. 10)')
    when upper(trim(p_need_position)) = 'GK' then lower(coalesce(p_primary,'')) ~ '(goalkeeper|keeper|gk)' or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) ~ '(goalkeeper|keeper|gk)')
    else lower(coalesce(p_primary,'')) = lower(trim(p_need_position)) or exists (select 1 from unnest(coalesce(p_secondary,'{}'::text[])) s where lower(s) = lower(trim(p_need_position)))
  end;
$$;

create or replace function djm_os.refresh_need_matches(p_need_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare n djm_os.club_needs%rowtype;
begin
  select * into n from djm_os.club_needs where id = p_need_id;
  if not found then return; end if;
  if n.status not in ('active','open','confirmed') then
    delete from djm_os.player_matches where club_need_id = p_need_id and status = 'suggested';
    return;
  end if;
  delete from djm_os.player_matches m using public.players p
  where m.club_need_id=p_need_id and m.player_id=p.id and m.status='suggested'
    and not (djm_os.position_matches_player(n.position,p.primary_position,p.secondary_positions)
      and (n.preferred_foot is null or lower(coalesce(p.preferred_foot,''))=lower(n.preferred_foot))
      and (n.min_age is null or p.date_of_birth is null or date_part('year',age(current_date,p.date_of_birth))>=n.min_age)
      and (n.max_age is null or p.date_of_birth is null or date_part('year',age(current_date,p.date_of_birth))<=n.max_age));
  insert into djm_os.player_matches(club_need_id,player_id,overall_score,football_score,commercial_score,registration_score,career_score,access_score,reasoning,status)
  select n.id,p.id,
    least(100,60
      + case when n.preferred_foot is null then 10 when lower(coalesce(p.preferred_foot,''))=lower(n.preferred_foot) then 15 else 0 end
      + case when n.min_age is null and n.max_age is null then 10 when p.date_of_birth is null then 5 when (n.min_age is null or date_part('year',age(current_date,p.date_of_birth))>=n.min_age) and (n.max_age is null or date_part('year',age(current_date,p.date_of_birth))<=n.max_age) then 15 else 0 end
      + case when lower(coalesce(p.football_status,'')) in ('active','available','signed','free agent','free_agent') then 10 else 5 end)::numeric,
    60::numeric,null::numeric,null::numeric,10::numeric,null::numeric,
    jsonb_build_object('position_match',true,'foot_match',case when n.preferred_foot is null then null else lower(coalesce(p.preferred_foot,''))=lower(n.preferred_foot) end,'age',case when p.date_of_birth is null then null else date_part('year',age(current_date,p.date_of_birth))::int end,'source','automatic_first_pass'),
    'suggested'
  from public.players p
  where djm_os.position_matches_player(n.position,p.primary_position,p.secondary_positions)
    and (n.preferred_foot is null or lower(coalesce(p.preferred_foot,''))=lower(n.preferred_foot))
    and (n.min_age is null or p.date_of_birth is null or date_part('year',age(current_date,p.date_of_birth))>=n.min_age)
    and (n.max_age is null or p.date_of_birth is null or date_part('year',age(current_date,p.date_of_birth))<=n.max_age)
  on conflict (club_need_id,player_id) do update set overall_score=excluded.overall_score,football_score=excluded.football_score,reasoning=excluded.reasoning,updated_at=now()
  where djm_os.player_matches.status='suggested';
end;
$$;
revoke all on function djm_os.refresh_need_matches(uuid) from public,anon,authenticated;
revoke all on function djm_os.position_matches_player(text,text,text[]) from public,anon;
grant execute on function djm_os.position_matches_player(text,text,text[]) to authenticated;

create or replace function djm_os.club_need_match_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin begin perform djm_os.refresh_need_matches(new.id); exception when others then raise warning 'DJM match refresh failed for need %: %',new.id,sqlerrm; end; return new; end; $$;
revoke all on function djm_os.club_need_match_trigger() from public,anon,authenticated;
drop trigger if exists trg_djm_need_match_refresh on djm_os.club_needs;
create trigger trg_djm_need_match_refresh after insert or update of position,preferred_foot,min_age,max_age,status on djm_os.club_needs for each row execute function djm_os.club_need_match_trigger();

create or replace function djm_os.player_change_bridge()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare n record; changed jsonb := '{}'::jsonb;
begin
  begin
    if old.primary_position is distinct from new.primary_position then changed:=changed||jsonb_build_object('primary_position',new.primary_position); end if;
    if old.secondary_positions is distinct from new.secondary_positions then changed:=changed||jsonb_build_object('secondary_positions',new.secondary_positions); end if;
    if old.preferred_foot is distinct from new.preferred_foot then changed:=changed||jsonb_build_object('preferred_foot',new.preferred_foot); end if;
    if old.contract_status is distinct from new.contract_status then changed:=changed||jsonb_build_object('contract_status',new.contract_status); end if;
    if old.contract_expiry is distinct from new.contract_expiry then changed:=changed||jsonb_build_object('contract_expiry',new.contract_expiry); end if;
    if old.current_club is distinct from new.current_club then changed:=changed||jsonb_build_object('current_club',new.current_club); end if;
    if old.current_country is distinct from new.current_country then changed:=changed||jsonb_build_object('current_country',new.current_country); end if;
    if old.football_status is distinct from new.football_status then changed:=changed||jsonb_build_object('football_status',new.football_status); end if;
    if changed<>'{}'::jsonb then
      insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at) values('PLAYER_MARKET_DATA_CHANGED',auth.uid(),new.id,changed,'djm_player',1,now());
      for n in select id from djm_os.club_needs where status in ('active','open','confirmed') loop perform djm_os.refresh_need_matches(n.id); end loop;
    end if;
  exception when others then raise warning 'DJM Player bridge skipped for player %: %',new.id,sqlerrm; end;
  return new;
end;
$$;
revoke all on function djm_os.player_change_bridge() from public,anon,authenticated;
drop trigger if exists trg_djm_player_market_bridge on public.players;
create trigger trg_djm_player_market_bridge after update of primary_position,secondary_positions,preferred_foot,contract_status,contract_expiry,current_club,current_country,football_status on public.players for each row execute function djm_os.player_change_bridge();

create or replace function public.djm_market_needs(p_status text default null)
returns table(id uuid,organisation_id uuid,organisation_name text,title text,need_position text,preferred_foot text,min_age smallint,max_age smallint,transfer_type text,transfer_budget numeric,salary_budget numeric,currency text,salary_period text,profile_notes text,registration_notes text,need_status text,confidence numeric,confirmed_at timestamptz,expires_at timestamptz,match_count bigint,top_match_score numeric)
language sql stable security invoker set search_path=''
as $$
  select n.id,n.organisation_id,o.name,n.title,n.position,n.preferred_foot,n.min_age,n.max_age,n.transfer_type,n.transfer_budget,n.salary_budget,n.currency,n.salary_period,n.profile_notes,n.registration_notes,n.status,n.confidence,n.confirmed_at,n.expires_at,
    (select count(*) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')),
    (select max(m.overall_score) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected'))
  from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id
  where p_status is null or p_status='' or n.status=p_status
  order by case when n.status in ('active','open','confirmed') then 0 else 1 end,n.updated_at desc;
$$;

create or replace function public.djm_market_matches(p_need_id uuid)
returns table(match_id uuid,player_id uuid,player_name text,current_club text,player_position text,preferred_foot text,overall_score numeric,match_status text,reasoning jsonb)
language sql stable security invoker set search_path=''
as $$
  select m.id,p.id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Player'),p.current_club,p.primary_position,p.preferred_foot,m.overall_score,m.status,m.reasoning
  from djm_os.player_matches m join public.players p on p.id=m.player_id
  where m.club_need_id=p_need_id
  order by m.overall_score desc nulls last,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Player');
$$;
revoke execute on function public.djm_market_needs(text) from public,anon;
revoke execute on function public.djm_market_matches(uuid) from public,anon;
grant execute on function public.djm_market_needs(text) to authenticated;
grant execute on function public.djm_market_matches(uuid) to authenticated;
notify pgrst,'reload schema';
