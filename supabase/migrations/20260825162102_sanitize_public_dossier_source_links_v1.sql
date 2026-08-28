create or replace function private.set_public_profile_career_timeline()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_stats_url text;
begin
  new.career_timeline := private.player_career_timeline(new.player_id);
  new.key_stats := private.player_authoritative_key_stats(new.player_id, new.key_stats);

  select p.stats_url
  into v_stats_url
  from public.players p
  where p.id = new.player_id;

  new.stats_url := v_stats_url;

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

  return new;
end;
$function$;

update public.player_public_profiles
set wyscout_url = case
      when wyscout_url is not null and lower(wyscout_url) not like '%wyscout.%' then null
      else wyscout_url
    end,
    stats_url = case
      when stats_url is not null and (
        lower(stats_url) like '%instagram.%'
        or lower(stats_url) like '%youtube.%'
        or lower(stats_url) like '%youtu.be%'
        or lower(stats_url) like '%tiktok.%'
        or lower(stats_url) like '%vimeo.%'
      ) then null
      else stats_url
    end
where (wyscout_url is not null and lower(wyscout_url) not like '%wyscout.%')
   or (stats_url is not null and (
        lower(stats_url) like '%instagram.%'
        or lower(stats_url) like '%youtube.%'
        or lower(stats_url) like '%youtu.be%'
        or lower(stats_url) like '%tiktok.%'
        or lower(stats_url) like '%vimeo.%'
      ));
