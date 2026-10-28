begin;
set local lock_timeout='5s';set local statement_timeout='30s';

do $preflight$
begin
 if not exists(select 1 from pg_proc where oid=to_regprocedure('private.redream_admin_tenant()') and md5(prosrc)='0db09e5c8619595554b61e48681e8e69' and prosecdef and proconfig=array['search_path=""']) then raise exception 'Unreviewed salary authority helper';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.platform_server_demand_control_fast(uuid,integer)') and md5(prosrc)='fe0818a4d8de7d61e052a6363606671a' and prosecdef and proconfig=array['search_path=""'])
  or has_function_privilege('authenticated','public.platform_server_demand_control_fast(uuid,integer)','EXECUTE')
  or has_function_privilege('anon','public.platform_server_demand_control_fast(uuid,integer)','EXECUTE') then raise exception 'Unreviewed salary control reader';end if;
end $preflight$;

-- Private agency terms extend the existing canonical facts. Legacy player notes
-- and their synchroniser remain untouched; no text is parsed into money.
alter table djm_os.player_market_facts
 add column salary_minimum numeric,
 add column salary_target numeric,
 add column salary_currency text,
 add column salary_period text,
 add column salary_tax_basis text,
 add column salary_source_status text,
 add column salary_source_context text,
 add column salary_checked_on date,
 add column salary_terms_updated_at timestamptz,
 add column salary_terms_updated_by uuid references auth.users(id) on delete set null,
 add constraint player_salary_minimum_valid check(salary_minimum is null or salary_minimum::text ~ '^\d{1,12}(\.\d{1,4})?$'),
 add constraint player_salary_target_valid check(salary_target is null or salary_target::text ~ '^\d{1,12}(\.\d{1,4})?$'),
 add constraint player_salary_range_valid check(salary_minimum is null or salary_target is null or salary_target>=salary_minimum),
 add constraint player_salary_currency_valid check(salary_currency is null or (salary_currency=upper(salary_currency) and private.invoice_currency_minor_unit_v1(salary_currency) is not null)),
 add constraint player_salary_precision_valid check(salary_currency is null or ((salary_minimum is null or scale(salary_minimum)<=private.invoice_currency_minor_unit_v1(salary_currency)) and (salary_target is null or scale(salary_target)<=private.invoice_currency_minor_unit_v1(salary_currency)))),
 add constraint player_salary_period_valid check(salary_period is null or salary_period in('weekly','monthly','annual')),
 add constraint player_salary_basis_valid check(salary_tax_basis is null or salary_tax_basis in('gross','net')),
 add constraint player_salary_source_valid check(salary_source_status is null or salary_source_status in('confirmed','reported','unverified')),
 add constraint player_salary_context_valid check(length(coalesce(salary_source_context,''))<=2000 and (salary_source_status is distinct from 'confirmed' or (nullif(btrim(salary_source_context),'') is not null and salary_checked_on is not null)));
create index player_market_salary_actor_idx on djm_os.player_market_facts(salary_terms_updated_by);

create function private.player_salary_terms_json(p_player_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $terms$
 select jsonb_build_object(
  'player_id',p.id,'salary_minimum',f.salary_minimum::text,'salary_target',f.salary_target::text,
  'salary_currency',f.salary_currency,'salary_period',f.salary_period,'salary_tax_basis',f.salary_tax_basis,
  'salary_source_status',f.salary_source_status,'salary_source_context',f.salary_source_context,'salary_checked_on',f.salary_checked_on,
  'updated_at',f.salary_terms_updated_at,'updated_by',f.salary_terms_updated_by,'legacy_salary_expectation',f.salary_expectation)
 from public.players p left join djm_os.player_market_facts f on f.player_id=p.id where p.id=p_player_id;
$terms$;
revoke all on function private.player_salary_terms_json(uuid) from public,anon,authenticated,service_role;

create function public.redream_player_salary_terms(p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $read$
declare t uuid:=private.redream_admin_tenant();
begin
 if not exists(select 1 from public.players where id=p_player_id and tenant_id=t and archived_at is null) then raise exception 'Player is unavailable in this workspace' using errcode='42501';end if;
 return jsonb_build_object('salary_terms_version',1,'terms',private.player_salary_terms_json(p_player_id));
end $read$;

create function public.redream_player_salary_terms_patch(p_player_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $write$
declare t uuid:=private.redream_admin_tenant();old_terms jsonb;v jsonb;k text;s text;currency_digits integer;
 v_minimum numeric;v_target numeric;v_currency text;v_period text;v_basis text;v_source_status text;v_context text;v_checked date;v_recorded timestamptz;
 allowed text[]:=array['salary_minimum','salary_target','salary_currency','salary_period','salary_tax_basis','salary_source_status','salary_source_context','salary_checked_on'];
begin
 perform 1 from public.players where id=p_player_id and tenant_id=t and archived_at is null for update;
 if not found then raise exception 'Player is unavailable in this workspace' using errcode='42501';end if;
 perform 1 from djm_os.player_market_facts where player_id=p_player_id for update;
 old_terms:=private.player_salary_terms_json(p_player_id);
 if nullif(old_terms->>'updated_at','')::timestamptz is distinct from p_expected_updated_at then raise exception 'The salary terms changed. Reload the latest details before saving.' using errcode='40001';end if;
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Check the salary fields and try again' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_patch) x where not(x.key=any(allowed)) or jsonb_typeof(x.value) not in('string','null')) then raise exception 'Check the salary fields and try again' using errcode='22023';end if;
 v:=old_terms;
 foreach k in array allowed loop
  if p_patch?k then v:=v||jsonb_build_object(k,nullif(btrim(p_patch->>k),''));end if;
 end loop;
 v_currency:=upper(v->>'salary_currency');v_period:=v->>'salary_period';v_basis:=v->>'salary_tax_basis';v_source_status:=v->>'salary_source_status';v_context:=v->>'salary_source_context';
 currency_digits:=case when v_currency is null then 4 else private.invoice_currency_minor_unit_v1(v_currency) end;
 if currency_digits is null then raise exception 'Choose a valid three-letter currency or leave it blank' using errcode='22023';end if;
 foreach k in array array['salary_minimum','salary_target'] loop
  s:=v->>k;
  if s is not null and (s!~'^\d{1,12}(\.\d{1,4})?$' or length(split_part(s,'.',2))>currency_digits) then raise exception 'Check salary amounts and currency precision' using errcode='22023';end if;
 end loop;
 v_minimum:=(v->>'salary_minimum')::numeric;v_target:=(v->>'salary_target')::numeric;
 if v_minimum is not null and v_target is not null and v_target<v_minimum then raise exception 'The salary target must not be below the minimum' using errcode='22023';end if;
 if (v_period is not null and v_period not in('weekly','monthly','annual')) or (v_basis is not null and v_basis not in('gross','net')) or (v_source_status is not null and v_source_status not in('confirmed','reported','unverified')) then raise exception 'Check the salary period, tax basis and source status' using errcode='22023';end if;
 if length(coalesce(v_context,''))>2000 or (v_source_status='confirmed' and (v_context is null or nullif(v->>'salary_checked_on','') is null)) then raise exception 'Add a source and checked date before marking terms confirmed; keep the source within 2,000 characters' using errcode='22023';end if;
 s:=v->>'salary_checked_on';
 if s is not null and s!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid checked date' using errcode='22023';end if;
 begin v_checked:=s::date;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Choose a valid checked date' using errcode='22023';end;
 if v_checked>current_date then raise exception 'The checked date cannot be in the future' using errcode='22023';end if;
 v:=v||jsonb_build_object('salary_currency',v_currency);
 if not exists(select 1 from unnest(allowed) x where nullif(old_terms->>x,'') is distinct from nullif(v->>x,'')) then
  return jsonb_build_object('ok',true,'id',p_player_id,'entity_type','player','salary_terms_version',1,'terms',old_terms);
 end if;
 v_recorded:=clock_timestamp();
 insert into djm_os.player_market_facts(player_id,salary_minimum,salary_target,salary_currency,salary_period,salary_tax_basis,salary_source_status,salary_source_context,salary_checked_on,salary_terms_updated_at,salary_terms_updated_by)
 values(p_player_id,v_minimum,v_target,v_currency,v_period,v_basis,v_source_status,v_context,v_checked,v_recorded,auth.uid())
 on conflict(player_id) do update set salary_minimum=excluded.salary_minimum,salary_target=excluded.salary_target,salary_currency=excluded.salary_currency,salary_period=excluded.salary_period,salary_tax_basis=excluded.salary_tax_basis,salary_source_status=excluded.salary_source_status,salary_source_context=excluded.salary_source_context,salary_checked_on=excluded.salary_checked_on,salary_terms_updated_at=excluded.salary_terms_updated_at,salary_terms_updated_by=excluded.salary_terms_updated_by;
 insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
 values(t,auth.uid(),'user','agency.player_salary_terms_updated','player',p_player_id::text,private.player_salary_terms_json(p_player_id),jsonb_build_object('changed_fields',to_jsonb(array(select jsonb_object_keys(p_patch)))));
 return jsonb_build_object('ok',true,'id',p_player_id,'entity_type','player','salary_terms_version',1,'terms',private.player_salary_terms_json(p_player_id));
end $write$;

create function private.player_need_salary_check(p_tenant_id uuid,p_need_id uuid,p_player_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $check$
declare n djm_os.club_needs%rowtype;f djm_os.player_market_facts%rowtype;state text;message text;missing text[]:='{}';result jsonb;
begin
 select * into n from djm_os.club_needs where id=p_need_id and tenant_id=p_tenant_id;
 if not found or not exists(select 1 from public.players where id=p_player_id and tenant_id=p_tenant_id and archived_at is null) then raise exception 'Salary comparison is unavailable in this workspace' using errcode='42501';end if;
 select * into f from djm_os.player_market_facts where player_id=p_player_id;
 if n.salary_budget is null or n.salary_budget::text!~'^\d{1,12}(\.\d{1,4})?$' then missing:=array_append(missing,'Club salary budget');end if;
 if f.salary_minimum is null and f.salary_target is null then missing:=array_append(missing,'Structured player salary expectation');end if;
 if nullif(btrim(n.currency),'') is null or private.invoice_currency_minor_unit_v1(upper(n.currency)) is null or f.salary_currency is null then missing:=array_append(missing,'Currency on both sides');end if;
 if coalesce(n.salary_period,'') not in('weekly','monthly','annual') or f.salary_period is null then missing:=array_append(missing,'Salary period on both sides');end if;
 if coalesce(n.salary_tax_basis,'') not in('gross','net') or f.salary_tax_basis is null then missing:=array_append(missing,'Gross or net basis on both sides');end if;
 if cardinality(missing)>0 then state:='missing_information';message:='Salary cannot be compared until the missing details are recorded.';
 elsif upper(n.currency)<>f.salary_currency then state:='different_currencies';message:='Currencies differ. No exchange rate has been assumed.';
 elsif n.salary_tax_basis<>f.salary_tax_basis then state:='different_tax_basis';message:='One figure is gross and the other is net. No tax conversion has been assumed.';
 elsif n.salary_period<>f.salary_period then state:='different_periods';message:='Salary periods differ. Confirm comparable payment terms before deciding affordability.';
 elsif f.salary_minimum is not null and f.salary_minimum>n.salary_budget then state:='minimum_above_budget';message:='The recorded salary minimum exceeds the club base-salary budget.';
 elsif f.salary_target is not null and f.salary_target>n.salary_budget then state:='target_above_budget';message:='The recorded target exceeds the budget. A lower acceptable salary must be agreed.';
 elsif f.salary_minimum is not null then state:='minimum_within_budget';message:='The recorded minimum base salary fits this budget. This is not acceptance of contract terms.';
 else state:='target_within_budget';message:='The recorded target base salary fits this budget. No minimum or agreement is established.';
 end if;
 result:=jsonb_build_object('version',1,'state',state,'message',message,'missing',to_jsonb(missing),
  'needs_source_confirmation',f.salary_source_status is distinct from 'confirmed' or n.source_status is distinct from 'confirmed',
  'hard_conflict',state='minimum_above_budget' and f.salary_source_status is not distinct from 'confirmed' and n.source_status is not distinct from 'confirmed',
  'club_budget',n.salary_budget::text,'club_currency',n.currency,'club_period',n.salary_period,'club_tax_basis',n.salary_tax_basis,
  'player_minimum',f.salary_minimum::text,'player_target',f.salary_target::text,'player_currency',f.salary_currency,'player_period',f.salary_period,'player_tax_basis',f.salary_tax_basis,
  'club_source_status',n.source_status,'source_status',f.salary_source_status,'source_context',f.salary_source_context,'checked_on',f.salary_checked_on,
  'scope','Base salary only; fees, bonuses, benefits, tax, exchange rates and contractual guarantees are not inferred.');
 return result||jsonb_build_object('fingerprint',md5(jsonb_build_object('need_id',n.id,'player_id',p_player_id,'need_version',n.updated_at,'terms_version',f.salary_terms_updated_at,'comparison',result)::text));
end $check$;
revoke all on function private.player_need_salary_check(uuid,uuid,uuid) from public,anon,authenticated,service_role;

revoke all on function public.redream_player_salary_terms(uuid),public.redream_player_salary_terms_patch(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.redream_player_salary_terms(uuid),public.redream_player_salary_terms_patch(uuid,timestamptz,jsonb) to authenticated,service_role;

-- Reuse the exact private admin reader. Recompute against current canonical
-- terms on every read; the old free-text score is never salary evidence.
do $readers$
declare spec jsonb;change jsonb;fn regprocedure;body text;before_meta jsonb;after_meta jsonb;
begin
 for spec in select value from jsonb_array_elements($spec$[{"signature":"public.platform_server_workspace_need_record(uuid,uuid,uuid)","hash":"14f801bce6cf4de83f72c8e8f9bbcf14","changes":[{"old":"pm.reasoning,pm.updated_at match_updated_at,","new":"pm.reasoning,pm.updated_at match_updated_at,\n    private.player_need_salary_check(p_tenant_id,pm.club_need_id,pm.player_id) salary_check,"},{"old":"'reasoning',coalesce(c.reasoning,'{}'::jsonb),","new":"'reasoning',coalesce(c.reasoning,'{}'::jsonb),\n      'salary_check',c.salary_check,"}]}]$spec$::jsonb) loop
  fn:=to_regprocedure(spec->>'signature');
  if fn is null then raise exception 'Missing reviewed reader: %',spec->>'signature';end if;
  select pg_get_functiondef(fn),jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'path',proconfig,'definer',prosecdef,'volatility',provolatile)
   into body,before_meta from pg_proc where oid=fn;
  if not exists(select 1 from pg_proc where oid=fn and md5(prosrc)=spec->>'hash' and prosecdef and proconfig=array['search_path=""']) or has_function_privilege('authenticated',fn,'EXECUTE') or has_function_privilege('anon',fn,'EXECUTE') then raise exception 'Reader drift: %',spec->>'signature';end if;
  for change in select value from jsonb_array_elements(spec->'changes') loop
   if (length(body)-length(replace(body,change->>'old','')))/length(change->>'old')<>1 then raise exception 'Unexpected salary reader anchor';end if;
   body:=replace(body,change->>'old',change->>'new');
  end loop;
  execute body;
  select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'path',proconfig,'definer',prosecdef,'volatility',provolatile)
   into after_meta from pg_proc where oid=fn;
  if before_meta is distinct from after_meta then raise exception 'Salary reader contract changed';end if;
 end loop;
end $readers$;

-- The original two-argument service reader is used by broader staff workflows.
-- Keep it byte-identical. Only the explicit admin overload returns private terms.
create function public.platform_server_demand_control_fast(p_tenant_id uuid,p_limit integer,p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $admin_control$
declare result jsonb;item jsonb;candidate jsonb;items jsonb:='[]';candidates jsonb;check_result jsonb;
begin
 if private.user_is_tenant_admin(p_tenant_id,p_user_id) is distinct from true then raise exception 'Agency administrator access required' using errcode='42501';end if;
 if p_tenant_id is null or p_user_id is null then raise exception 'Agency administrator access required' using errcode='42501';end if;
 result:=public.platform_server_demand_control_fast(p_tenant_id,p_limit);
 for item in select value from jsonb_array_elements(coalesce(result->'items','[]'::jsonb)) loop
  candidates:='[]';
  for candidate in select value from jsonb_array_elements(coalesce(item#>'{candidate_coverage,candidates}','[]'::jsonb)) loop
   if exists(select 1 from public.players p where p.id=(candidate->>'player_id')::uuid and p.tenant_id=p_tenant_id and p.archived_at is null) then
    check_result:=private.player_need_salary_check(p_tenant_id,(item->>'club_need_id')::uuid,(candidate->>'player_id')::uuid);
   else
    check_result:=jsonb_build_object('version',1,'state','unavailable','message','Salary comparison is unavailable. Review this player record.');
   end if;
   candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('salary_check',check_result));
  end loop;
  items:=items||jsonb_build_array(jsonb_set(item,'{candidate_coverage,candidates}',candidates));
 end loop;
 return jsonb_set(result,'{items}',items);
end $admin_control$;
revoke all on function public.platform_server_demand_control_fast(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_demand_control_fast(uuid,integer,uuid) to service_role;

notify pgrst,'reload schema';
commit;
