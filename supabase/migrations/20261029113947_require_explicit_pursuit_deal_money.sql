begin;
set local lock_timeout='5s';set local statement_timeout='30s';
-- Forward-only: the current financial/career gates must already be installed.
-- Currency is an explicit deal input. Optional agency commission is never
-- inferred from a salary, budget or an old EUR default. No rows are rewritten.
do $money$
declare fn regprocedure:=to_regprocedure('public.platform_server_convert_pursuit_to_deal(uuid,uuid,uuid,jsonb)');original pg_proc%rowtype;updated pg_proc%rowtype;patched text;change jsonb;
begin
 select * into original from pg_proc where oid=fn;
 if not found or md5(original.prosrc)<>'760b72b223f8af975c691e0ee78759dd' or not original.prosecdef or original.proconfig is distinct from array['search_path=""']::text[] then raise exception 'Unreviewed pursuit-deal money writer';end if;
 if has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE') or not has_function_privilege('service_role',fn,'EXECUTE') then raise exception 'Unreviewed pursuit-deal writer grants';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('private.invoice_currency_minor_unit_v1(text)') and md5(prosrc)='7a55e13cc590c2bf75c885bab12cadfc' and not prosecdef and proisstrict and provolatile='i' and proconfig=array['search_path=""']) then raise exception 'Unreviewed currency precision dependency';end if;
 patched:=original.prosrc;
 for change in select value from jsonb_array_elements($changes$[["v_currency text:=upper(coalesce(nullif(trim(p_input->>'currency'),''),'EUR'));","v_currency text:=upper(nullif(trim(p_input->>'currency'),''));\n  v_commission_text text:=nullif(trim(p_input->>'expected_commission'),'');\n  v_minor_units integer;"],["if v_stage not in ('qualifying','contacted','interest','negotiating','offer') then raise exception 'human_stage_required_for_new_deal'; end if;","if v_stage is null or v_stage not in ('qualifying','contacted','interest','negotiating','offer') then raise exception 'Choose the current deal stage.' using errcode='22023'; end if;"],["if nullif(trim(p_input->>'probability'),'') is null then raise exception 'human_probability_required_for_new_deal'; end if;","if coalesce(trim(p_input->>'probability'),'')!~'^[0-9]{1,3}$' then raise exception 'Enter your own whole-number deal probability from 0 to 100.' using errcode='22023'; end if;"],["if v_probability<0 or v_probability>100 then raise exception 'probability_must_be_0_to_100'; end if;","if v_probability<0 or v_probability>100 then raise exception 'Enter your own whole-number deal probability from 0 to 100.' using errcode='22023'; end if;\n  v_minor_units:=private.invoice_currency_minor_unit_v1(v_currency);\n  if v_minor_units is null then raise exception 'Choose a valid currency for this deal.' using errcode='22023';end if;"],["if nullif(trim(p_input->>'expected_commission'),'') is not null then\n    v_expected:=(p_input->>'expected_commission')::numeric;\n    if v_expected<0 then raise exception 'expected_commission_cannot_be_negative'; end if;\n  end if;","if v_commission_text is not null then\n    if v_commission_text!~'^[0-9]{1,12}([.][0-9]{1,4})?$' or length(split_part(v_commission_text,'.',2))>v_minor_units then raise exception 'Check the expected agency commission and currency precision.' using errcode='22023';end if;\n    v_expected:=v_commission_text::numeric;\n  end if;"],["'deal',to_jsonb(v_existing),","'deal',jsonb_set(to_jsonb(v_existing),'{expected_commission}',coalesce(to_jsonb(v_existing.expected_commission::text),'null'::jsonb)),"],["'deal',to_jsonb(v_deal),","'deal',jsonb_set(to_jsonb(v_deal),'{expected_commission}',coalesce(to_jsonb(v_deal.expected_commission::text),'null'::jsonb)),"]]$changes$::jsonb) loop
  if position(change->>0 in patched)=0 then raise exception 'Pursuit money patch source missing';end if;
  patched:=replace(patched,change->>0,change->>1);
 end loop;
 execute replace(pg_get_functiondef(fn),original.prosrc,patched);
 select * into updated from pg_proc where oid=fn;
 if row(original.oid,original.proowner,original.proacl,original.prosecdef,original.proconfig,original.provolatile) is distinct from row(updated.oid,updated.proowner,updated.proacl,updated.prosecdef,updated.proconfig,updated.provolatile) then raise exception 'Pursuit-deal writer contract changed';end if;
end $money$;
notify pgrst,'reload schema';
commit;
