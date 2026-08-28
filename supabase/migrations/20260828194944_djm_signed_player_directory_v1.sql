create or replace function public.djm_signed_player_directory(p_search text default null,p_limit integer default 250) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.player_name)
    from (
      select p.id,
        coalesce(nullif(p.preferred_name,''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') as player_name,
        p.current_club,p.current_country,p.current_league,p.primary_position,p.football_status,
        p.transfermarkt_url,p.stats_url,p.instagram_url
      from public.players p
      where p_search is null or p_search='' or concat_ws(' ',p.preferred_name,p.first_name,p.last_name,p.current_club,p.current_country,p.current_league,p.primary_position) ilike '%'||p_search||'%'
      order by coalesce(nullif(p.preferred_name,''),p.first_name),p.last_name
      limit greatest(1,least(coalesce(p_limit,250),500))
    ) x
  ),'[]'::jsonb);
end; $$;
revoke all on function public.djm_signed_player_directory(text,integer) from public,anon;
grant execute on function public.djm_signed_player_directory(text,integer) to authenticated,service_role;
notify pgrst,'reload schema';
