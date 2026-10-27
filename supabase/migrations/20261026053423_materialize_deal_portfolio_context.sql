-- Evaluate each existing scoped war-room result once before portfolio projection/ranking.
-- Preserve both existing reader contracts and every caller's access boundary.
do $migration$
declare
 item jsonb;
 target oid;
 source text; definition text;
 original_owner oid; original_acl aclitem[]; original_config text[];
 original_definer boolean; original_volatility "char";
begin
 perform set_config('lock_timeout','5s',true);
 perform set_config('statement_timeout','30s',true);
 for item in select value from jsonb_array_elements('[
  {"identity":"public.platform_server_deal_portfolio(uuid,integer)","before":"24e171425b815cb1501abe4ff5e4ea52","after":"d46835dd0718dea240176d53b6d37153"},
  {"identity":"public.platform_server_deal_portfolio_v2(uuid,integer)","before":"45882fa929626bc52e043777b9044a22","after":"dae54c4b4b11608ae5d845da24b284a1"}
 ]'::jsonb) loop
  target:=to_regprocedure(item->>'identity');
  if target is null then raise exception 'Reviewed portfolio reader is missing: %',item->>'identity';end if;
  select prosrc,proowner,proacl,proconfig,prosecdef,provolatile
   into source,original_owner,original_acl,original_config,original_definer,original_volatility
   from pg_proc where oid=target;
  if md5(source)=item->>'after' then continue;end if;
  if md5(source)<>item->>'before' then
   raise exception 'Portfolio reader differs from the reviewed baseline: %',item->>'identity';
  end if;
  definition:=pg_get_functiondef(target);
  if (length(definition)-length(replace(definition,'), war as (','')))/length('), war as (')<>1 then
   raise exception 'Reviewed per-deal context CTE is missing or ambiguous: %',item->>'identity';
  end if;
  execute replace(definition,'), war as (','), war as materialized (');
  if target is distinct from to_regprocedure(item->>'identity') or not exists(
   select 1 from pg_proc where oid=target and md5(prosrc)=item->>'after'
    and proowner=original_owner and proacl is not distinct from original_acl
    and proconfig is not distinct from original_config and prosecdef=original_definer
    and provolatile=original_volatility
  ) then raise exception 'Portfolio reader changed its reviewed function contract: %',item->>'identity';end if;
 end loop;
end;
$migration$;
