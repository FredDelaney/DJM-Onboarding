begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $dependency$
begin
 if not exists(select 1 from pg_proc where oid=to_regprocedure('private.invoice_currency_minor_unit_v1(text)') and md5(prosrc)='7a55e13cc590c2bf75c885bab12cadfc' and proowner=(select proowner from pg_proc where oid='public.platform_server_agency_create_club_need(uuid,uuid,text,text,text,text,text,date)'::regprocedure)) then
  raise exception 'Reviewed currency precision prerequisite is required';
 end if;
end $dependency$;
-- Additive, private operational facts. Existing rows stay unknown; no backfill.
alter table djm_os.club_needs
  add column contract_months smallint check (contract_months between 1 and 120),
  add column contract_guaranteed boolean,
  add column option_months smallint check (option_months between 1 and 120),
  add column availability_notes text,
  add column source_status text check (source_status in ('confirmed','reported','unverified'));

-- Identity is auth.users; agency membership remains enforced by the writers.
do $fk$
declare c pg_constraint%rowtype;
begin
 select * into strict c from pg_constraint where conrelid='djm_os.club_needs'::regclass and conname='club_needs_owner_user_id_fkey';
 if c.confrelid<>'djm_os.team_members'::regclass or c.confdeltype<>'n' or c.conkey<>array[(select attnum from pg_attribute where attrelid=c.conrelid and attname='owner_user_id')]::smallint[]
 then raise exception 'Unexpected club need owner identity contract'; end if;
 alter table djm_os.club_needs drop constraint club_needs_owner_user_id_fkey;
 alter table djm_os.club_needs add constraint club_needs_owner_user_id_fkey foreign key(owner_user_id) references auth.users(id) on delete set null;
end $fk$;

-- Shared validator/writer for the existing create and edit entrypoints, not a second record model.
create function private.platform_club_need_brief_patch(p_tenant_id uuid,p_need_id uuid,p_patch jsonb)
returns void language plpgsql security invoker set search_path='' as $body$
declare n djm_os.club_needs%rowtype; merged jsonb; k text; val text; digits integer; code text;
begin
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Check the request details'; end if;
 select * into n from djm_os.club_needs where id=p_need_id and tenant_id=p_tenant_id and archived_at is null for update;
 if not found then raise exception 'This club request is unavailable'; end if;
 merged:=to_jsonb(n)||p_patch;
 code:=upper(nullif(trim(merged->>'currency'),''));
 if p_patch?'currency' and code is not null and private.invoice_currency_minor_unit_v1(code) is null then raise exception 'Choose a valid three-letter currency, or leave it blank'; end if;
 foreach k in array array['salary_budget','transfer_budget'] loop
  if p_patch?k or p_patch?'currency' then
   val:=nullif(trim(merged->>k),''); digits:=coalesce(private.invoice_currency_minor_unit_v1(code),4);
   if val is not null and (val!~'^[0-9]{1,12}(\.[0-9]{1,4})?$' or length(coalesce(split_part(val,'.',2),''))>digits) then raise exception 'Check the salary or transfer fee budget and currency precision'; end if;
  end if;
 end loop;
 foreach k in array array['contract_months','option_months'] loop
  val:=nullif(trim(merged->>k),'');
  if p_patch?k and val is not null and (val!~'^[0-9]{1,3}$' or val::integer not between 1 and 120) then raise exception 'Contract and extension terms must be between 1 and 120 months'; end if;
 end loop;
 if p_patch?'salary_period' and coalesce(nullif(p_patch->>'salary_period',''),'monthly') not in ('monthly','weekly','annual') then raise exception 'Check the salary period'; end if;
 if p_patch?'salary_tax_basis' and coalesce(nullif(p_patch->>'salary_tax_basis',''),'gross') not in ('gross','net') then raise exception 'Check the tax basis'; end if;
 if p_patch?'transfer_type' and coalesce(nullif(p_patch->>'transfer_type',''),'free_agent') not in ('free_agent','permanent','loan') then raise exception 'Check the transfer preference'; end if;
 if p_patch?'source_status' and coalesce(nullif(p_patch->>'source_status',''),'unverified') not in ('confirmed','reported','unverified') then raise exception 'Check the source status'; end if;
 if p_patch?'contract_guaranteed' and coalesce(nullif(p_patch->>'contract_guaranteed',''),'true') not in ('true','false') then raise exception 'Check the contract guarantee'; end if;
 if (p_patch?'contract_guaranteed' or p_patch?'contract_months') and nullif(merged->>'contract_guaranteed','') is not null and nullif(merged->>'contract_months','') is null then raise exception 'Add the initial contract term before recording its guarantee'; end if;
 if p_patch?'availability_notes' and length(p_patch->>'availability_notes')>2000 then raise exception 'Keep availability details within 2,000 characters'; end if;
 update djm_os.club_needs set
  salary_budget=case when p_patch?'salary_budget' then nullif(trim(p_patch->>'salary_budget'),'')::numeric else salary_budget end,
  transfer_budget=case when p_patch?'transfer_budget' then nullif(trim(p_patch->>'transfer_budget'),'')::numeric else transfer_budget end,
  currency=case when p_patch?'currency' then code else currency end,
  salary_period=case when p_patch?'salary_period' then nullif(p_patch->>'salary_period','') else salary_period end,
  salary_tax_basis=case when p_patch?'salary_tax_basis' then nullif(p_patch->>'salary_tax_basis','') else salary_tax_basis end,
  contract_months=case when p_patch?'contract_months' then nullif(p_patch->>'contract_months','')::smallint else contract_months end,
  contract_guaranteed=case when p_patch?'contract_guaranteed' then nullif(p_patch->>'contract_guaranteed','')::boolean else contract_guaranteed end,
  option_months=case when p_patch?'option_months' then nullif(p_patch->>'option_months','')::smallint else option_months end,
  transfer_type=case when p_patch?'transfer_type' then nullif(p_patch->>'transfer_type','') else transfer_type end,
  availability_notes=case when p_patch?'availability_notes' then nullif(trim(p_patch->>'availability_notes'),'') else availability_notes end,
  source_status=case when p_patch?'source_status' then nullif(p_patch->>'source_status','') else source_status end,
  confirmed_at=case when p_patch?'source_status' then case when p_patch->>'source_status'='confirmed' then coalesce(confirmed_at,now()) else null end else confirmed_at end,
  updated_at=now()
 where id=p_need_id and tenant_id=p_tenant_id;
end $body$;
revoke all on function private.platform_club_need_brief_patch(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.platform_server_agency_create_club_need_brief(p_tenant_id uuid,p_actor_user_id uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare created jsonb; brief jsonb;
begin
 perform private.platform_server_assert_agency_operator(p_tenant_id,p_actor_user_id);
 if jsonb_typeof(p_request) is distinct from 'object' then raise exception 'Check the club request'; end if;
 brief:=coalesce(p_request->'brief','{}'::jsonb);
 if jsonb_typeof(brief) is distinct from 'object' or exists(select 1 from jsonb_object_keys(brief) k where k not in ('salary_budget','transfer_budget','currency','salary_period','salary_tax_basis','contract_months','contract_guaranteed','option_months','transfer_type','availability_notes','source_status')) then raise exception 'Refresh ReDream before saving these request details'; end if;
 created:=public.platform_server_agency_create_club_need(p_tenant_id,p_actor_user_id,p_request->>'club_name',p_request->>'country',p_request->>'position',p_request->>'title',p_request->>'notes',nullif(p_request->>'expires_on','')::date);
 perform private.platform_club_need_brief_patch(p_tenant_id,(created->>'club_need_id')::uuid,brief||jsonb_build_object('source_status',coalesce(nullif(brief->>'source_status',''),'unverified')));
 return created||jsonb_build_object('brief_version',1);
end $body$;
revoke all on function public.platform_server_agency_create_club_need_brief(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_agency_create_club_need_brief(uuid,uuid,jsonb) to service_role;

-- Preserve OIDs, metadata, grants and unrelated branches. Fail closed on any unreviewed body.
do $patch$
declare spec jsonb; change jsonb; function_oid regprocedure; source text; definition text;
begin
 for spec in select value from jsonb_array_elements($spec$[{"signature": "public.platform_server_agency_create_club_need(uuid,uuid,text,text,text,text,text,date)", "hash": "1c7617baa8d5de760df3a68ef96061df", "changes": [{"old": "  perform private.platform_server_ensure_team_member(p_actor_user_id);", "new": "  -- Agency operator membership above is the canonical authorisation boundary."}]}, {"signature": "public.djm_entity_patch_v1(text,uuid,jsonb)", "hash": "e4ab149c21986cf3bff7f0cdc70a5522", "changes": [{"old": "  elsif p_entity_type='club_need' then\n    update", "new": "  elsif p_entity_type='club_need' then\n    perform private.platform_club_need_brief_patch(v_tenant,p_entity_id,v_patch);\n    update"}]}, {"signature": "public.platform_server_workspace_need_record(uuid,uuid,uuid)", "hash": "8f0945f944b139dad84bab5b3b8d30aa", "changes": [{"old": "'salary_budget',salary_budget", "new": "'salary_budget',salary_budget::text"}, {"old": "'transfer_budget',transfer_budget", "new": "'transfer_budget',transfer_budget::text"}, {"old": "'salary_period',salary_period", "new": "'salary_period',salary_period,'salary_tax_basis',salary_tax_basis,'profile_notes',profile_notes,'raw_request',raw_request,'source_context',source_context,'source_status',source_status,'availability_notes',availability_notes,'contract_months',contract_months,'contract_guaranteed',contract_guaranteed,'option_months',option_months,'updated_at',updated_at"}]}, {"signature": "public.platform_server_demand_control_fast(uuid,integer)", "hash": "302e31bcb9c0e9ee6fc1a65f08bb0ff7", "changes": [{"old": "'salary_budget',salary_budget", "new": "'salary_budget',salary_budget::text"}, {"old": "'transfer_budget',transfer_budget", "new": "'transfer_budget',transfer_budget::text"}, {"old": "'salary_period',salary_period", "new": "'salary_period',salary_period,'salary_tax_basis',salary_tax_basis,'profile_notes',profile_notes,'raw_request',raw_request,'source_context',source_context,'source_status',source_status,'availability_notes',availability_notes,'contract_months',contract_months,'contract_guaranteed',contract_guaranteed,'option_months',option_months,'updated_at',updated_at"}]}]$spec$::jsonb) loop
  function_oid:=to_regprocedure(spec->>'signature');
  select prosrc,pg_get_functiondef(function_oid) into source,definition from pg_proc where pg_proc.oid=function_oid;
  if source is null or md5(source)<>(spec->>'hash') then raise exception 'Unreviewed club request function %',spec->>'signature'; end if;
  for change in select value from jsonb_array_elements(spec->'changes') loop
   if (length(source)-length(replace(source,change->>'old','')))/length(change->>'old')<>1 then raise exception 'Unexpected patch occurrence'; end if;
   source:=replace(source,change->>'old',change->>'new');
   definition:=replace(definition,change->>'old',change->>'new');
  end loop;
  execute definition;
 end loop;
end $patch$;
-- A narrow browser entrypoint; the old generic public alias is absent on staging.
-- Reuse the existing writer, request scope and audit path. No actor can be supplied by a client.
create function public.redream_club_need_patch(p_need_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare n djm_os.club_needs%rowtype; result jsonb;
begin
 select * into n from djm_os.club_needs where id=p_need_id and archived_at is null for update;
 if not found or not private.user_is_tenant_admin(n.tenant_id,auth.uid()) or n.tenant_id is distinct from private.redream_request_tenant() then raise exception 'This club request is unavailable' using errcode='42501'; end if;
 if p_expected_updated_at is null or p_expected_updated_at is distinct from n.updated_at then raise exception 'This request has changed. Close and reopen it before editing again'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('title','position','profile_notes','expires_at','salary_budget','transfer_budget','currency','salary_period','salary_tax_basis','contract_months','contract_guaranteed','option_months','transfer_type','availability_notes','source_status')) then raise exception 'Refresh ReDream before editing this request'; end if;
 if (p_patch?'position' and coalesce(trim(p_patch->>'position'),'')='') or (p_patch?'title' and coalesce(trim(p_patch->>'title'),'')='') then raise exception 'Keep a title and position for this request'; end if;
 if length(p_patch->>'profile_notes')>4000 or length(p_patch->>'title')>200 or length(p_patch->>'position')>200 then raise exception 'Shorten the request details before saving'; end if;
 -- Date-only expiry means valid through that day, as in the create writer.
 if p_patch?'expires_at' and p_patch->>'expires_at'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
  p_patch:=p_patch||jsonb_build_object('expires_at',(((p_patch->>'expires_at')::date+1)::timestamptz-interval '1 second')::text);
 end if;
 result:=public.djm_entity_patch_v1('club_need',p_need_id,p_patch);
 return result||jsonb_build_object('brief_version',1);
end $body$;
revoke all on function public.redream_club_need_patch(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.redream_club_need_patch(uuid,timestamptz,jsonb) to authenticated,service_role;
commit;
