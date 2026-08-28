create or replace function private.normalize_career_competition_label()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_code text := upper(pg_catalog.btrim(coalesce(new.league, '')));
begin
  new.league := case v_code
    when 'SE1' then 'Allsvenskan'
    when 'SE2' then 'Superettan'
    when 'SE3N' then 'Ettan Norra'
    when 'SE3S' then 'Ettan Södra'
    when 'SEC' then 'Svenska Cupen'
    when 'SLO1' then 'Niké Liga'
    when 'SK2' then 'Slovak 2. Liga'
    when '511' then 'Derde Divisie Sunday'
    else new.league
  end;
  return new;
end;
$function$;

drop trigger if exists normalize_career_competition_label on public.career_entries;
create trigger normalize_career_competition_label
before insert or update of league on public.career_entries
for each row execute function private.normalize_career_competition_label();

alter table public.career_entries disable trigger trg_career_change_requires_review;

update public.career_entries
set league = case upper(pg_catalog.btrim(coalesce(league, '')))
  when 'SE1' then 'Allsvenskan'
  when 'SE2' then 'Superettan'
  when 'SE3N' then 'Ettan Norra'
  when 'SE3S' then 'Ettan Södra'
  when 'SEC' then 'Svenska Cupen'
  when 'SLO1' then 'Niké Liga'
  when 'SK2' then 'Slovak 2. Liga'
  when '511' then 'Derde Divisie Sunday'
  else league
end
where upper(pg_catalog.btrim(coalesce(league, ''))) in ('SE1','SE2','SE3N','SE3S','SEC','SLO1','SK2','511');

alter table public.career_entries enable trigger trg_career_change_requires_review;

update public.player_public_profiles pp
set career_timeline = private.player_career_timeline(pp.player_id),
    key_stats = private.player_authoritative_key_stats(pp.player_id, pp.key_stats)
where exists (
  select 1
  from public.career_entries ce
  where ce.player_id = pp.player_id
    and ce.source_reviewed_at is not null
);

revoke all on function private.normalize_career_competition_label() from public, anon, authenticated;
