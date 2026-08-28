create or replace function private.set_public_profile_career_timeline()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_stats_url text;
  v_market_source text := lower(coalesce(new.market_value_source_url, ''));
begin
  new.career_timeline := private.player_career_timeline(new.player_id);
  new.key_stats := private.player_authoritative_key_stats(new.player_id, new.key_stats);

  select p.stats_url
  into v_stats_url
  from public.players p
  where p.id = new.player_id;

  new.stats_url := v_stats_url;

  if lower(pg_catalog.btrim(coalesce(new.current_club, ''))) in (
    'n/a','na','none','not applicable','-','—'
  ) then
    new.current_club := null;
  end if;

  if new.transfermarkt_url is not null
     and lower(new.transfermarkt_url) not like '%transfermarkt.%' then
    new.transfermarkt_url := null;
  end if;

  if new.wyscout_url is not null
     and lower(new.wyscout_url) not like '%wyscout.%' then
    new.wyscout_url := null;
  end if;

  if new.stats_url is not null
     and (
       lower(new.stats_url) like '%instagram.%'
       or lower(new.stats_url) like '%youtube.%'
       or lower(new.stats_url) like '%youtu.be%'
       or lower(new.stats_url) like '%tiktok.%'
       or lower(new.stats_url) like '%vimeo.%'
     ) then
    new.stats_url := null;
  end if;

  if coalesce(new.hide_market_value, true) = false
     and (
       v_market_source like '%instagram.%'
       or v_market_source like '%youtube.%'
       or v_market_source like '%youtu.be%'
       or v_market_source like '%tiktok.%'
       or v_market_source like '%vimeo.%'
     ) then
    new.hide_market_value := true;
  end if;

  return new;
end;
$function$;

update public.player_public_profiles
set current_club = current_club,
    hide_market_value = hide_market_value
where lower(pg_catalog.btrim(coalesce(current_club, ''))) in ('n/a','na','none','not applicable','-','—')
   or (
     coalesce(hide_market_value, true) = false
     and (
       lower(coalesce(market_value_source_url, '')) like '%instagram.%'
       or lower(coalesce(market_value_source_url, '')) like '%youtube.%'
       or lower(coalesce(market_value_source_url, '')) like '%youtu.be%'
       or lower(coalesce(market_value_source_url, '')) like '%tiktok.%'
       or lower(coalesce(market_value_source_url, '')) like '%vimeo.%'
     )
   );
