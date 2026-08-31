create or replace function djm_os.global_competition_level_score(p_country text, p_league text, p_level_tier integer default null)
returns numeric
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_base numeric;
  v_tier integer;
  v_inferred integer;
  v_penalty numeric;
  v_league text:=lower(btrim(coalesce(p_league,'')));
  v_known boolean:=false;
begin
  if v_league in ('','n/a','na','unknown','none','all competitions','all competition') then return null; end if;
  v_inferred:=djm_os.infer_global_league_tier(p_country,p_league);
  select exists(
    select 1 from djm_os.competitions c
    where (nullif(trim(coalesce(p_country,'')),'') is null or lower(trim(coalesce(c.country,'')))=lower(trim(p_country)))
      and (
        lower(trim(c.display_name))=lower(trim(p_league))
        or exists(select 1 from unnest(coalesce(c.aliases,'{}'::text[])) a where lower(trim(a))=lower(trim(p_league)))
      )
      and (p_level_tier is null or c.level_tier=p_level_tier)
  ) into v_known;
  if p_level_tier is not null and v_inferred is null and not v_known then return null; end if;
  v_tier:=coalesce(p_level_tier,v_inferred);
  if v_tier is null then return null; end if;
  v_base:=djm_os.global_country_top_league_score(p_country); if v_base is null then return null; end if;
  v_penalty:=case v_tier when 0 then 0 when 1 then 0 when 2 then 8 when 3 then 15 when 4 then 22 else 28 end;
  return round(greatest(15,least(100,v_base-v_penalty)),2);
end;
$$;