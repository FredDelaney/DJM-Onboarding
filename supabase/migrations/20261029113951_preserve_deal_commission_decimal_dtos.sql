begin;
set local lock_timeout='5s';set local statement_timeout='30s';
-- Keep PostgreSQL numeric values exact across JSON transport. Existing
-- computations, tenant scope, permissions and every other DTO field stay intact.
do $decimal_dtos$
declare spec jsonb;change jsonb;fn regprocedure;original pg_proc%rowtype;updated pg_proc%rowtype;patched text;
begin
 for spec in select value from jsonb_array_elements($spec$[{"signature":"public.platform_server_deal_closeout_control(uuid,uuid)","hash":"2a204a25491832880d28c302b8c34c9f","changes":[["'expected_commission',v_deal.expected_commission,","'expected_commission',v_deal.expected_commission::text,"]]},{"signature":"public.platform_server_deal_portfolio_v2(uuid,integer)","hash":"dae54c4b4b11608ae5d845da24b284a1","changes":[["'expected_commission',(item->'deal'->>'expected_commission')::numeric,","'expected_commission',item->'deal'->>'expected_commission',"],["'expected_commission',expected_commission,'weighted_commission',weighted_commission)","'expected_commission',expected_commission::text,'weighted_commission',weighted_commission::text)"]]},{"signature":"public.platform_server_deal_war_room(uuid,uuid)","hash":"b338cad2143c03b7b202b9543fcc05e7","changes":[["'expected_commission',v_deal.expected_commission,","'expected_commission',v_deal.expected_commission::text,"]]},{"signature":"public.platform_server_deal_war_room_instant(uuid,uuid)","hash":"3b084b0242442039602e9c16480a7d3f","changes":[["'expected_commission',v_deal.expected_commission,","'expected_commission',v_deal.expected_commission::text,"]]}]$spec$::jsonb) loop
  fn:=to_regprocedure(spec->>'signature');select * into original from pg_proc where oid=fn;
  if not found or md5(original.prosrc)<>spec->>'hash' or not original.prosecdef or original.proconfig is distinct from array['search_path=""']::text[] then raise exception 'Unreviewed deal-money read model: %',spec->>'signature';end if;
  patched:=original.prosrc;
  for change in select value from jsonb_array_elements(spec->'changes') loop
   if position(change->>0 in patched)=0 then raise exception 'Deal-money projection source missing';end if;
   patched:=replace(patched,change->>0,change->>1);
  end loop;
  execute replace(pg_get_functiondef(fn),original.prosrc,patched);
  select * into updated from pg_proc where oid=fn;
  if row(original.oid,original.proowner,original.proacl,original.prosecdef,original.proconfig,original.provolatile) is distinct from row(updated.oid,updated.proowner,updated.proacl,updated.prosecdef,updated.proconfig,updated.provolatile) then raise exception 'Deal-money read model contract changed';end if;
 end loop;
end $decimal_dtos$;
notify pgrst,'reload schema';
commit;
