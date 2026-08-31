create or replace function djm_os.global_competition_level_score(p_country text,p_league text,p_level_tier integer default null)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_base numeric; v_tier integer; v_penalty numeric; v_league text:=lower(btrim(coalesce(p_league,'')));
begin
  if v_league in ('','n/a','na','unknown','none','all competitions','all competition') then return null; end if;
  v_tier:=coalesce(p_level_tier,djm_os.infer_global_league_tier(p_country,p_league));
  if v_tier is null then return null; end if;
  v_base:=djm_os.global_country_top_league_score(p_country); if v_base is null then return null; end if;
  v_penalty:=case v_tier when 1 then 0 when 2 then 8 when 3 then 15 when 4 then 22 else 28 end;
  return round(greatest(15,least(100,v_base-v_penalty)),2);
end; $$;

do $$ declare r record; begin for r in select id from djm_os.football_intelligence_subjects loop perform djm_os.refresh_football_subject_scorecard(r.id); end loop; end $$;