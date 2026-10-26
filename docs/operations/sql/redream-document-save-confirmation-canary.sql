-- Staging ltvmopvarlnidiozvpow only. All synthetic writes roll back.
-- The existing Jesse/Northstar owner is the previously authorised participant.
begin;
select set_config('request.jwt.claim.sub','675c4f97-f5b9-4686-912f-938b01b4df18',true);
set local role authenticated;
do $qa$
declare id uuid:=gen_random_uuid(); doc jsonb; result jsonb; count_before integer;
  content jsonb:='{"brand":{"name":"Northstar Football Management","legalName":"Northstar Football Management","logoUrl":"","primary":"#24143D","accent":"#8B6CDA","email":"qa@example.test","phone":"","website":"","address":"","registration":"","bankDetails":""},"fields":{},"sections":[{"id":"qa","title":"QA software test only","body":"Synthetic confirmation test. Not for execution or sharing."}],"lines":[],"sources":[],"reviewed":false}';
begin
  if current_user<>'authenticated' then raise exception 'Actual authenticated role required'; end if;
  result:=public.redream_document_read('northstar-football-management',id);
  if result->>'state' is distinct from 'missing' or result->>'tenant_id' is distinct from '7ac91076-7836-4dfa-9ed0-4d825ae2c3dd' then raise exception 'Missing/scope mismatch'; end if;
  doc:=public.redream_documents('northstar-football-management','save',id,0,jsonb_build_object('kind','player_contract','title','[QA] Save confirmation rollback canary','content',content));
  result:=public.redream_document_read('northstar-football-management',id);
  if result->>'state' is distinct from 'found' or result->'document'->'content' is distinct from content or (result->'document'->>'revision')::int is distinct from 1 then raise exception 'Create confirmation mismatch'; end if;
  if result->'document' ? 'created_by' then raise exception 'Unnecessary actor exposure'; end if;
  count_before:=jsonb_array_length(public.redream_documents('northstar-football-management','events',id,1));
  perform public.redream_document_read('northstar-football-management',id);
  if jsonb_array_length(public.redream_documents('northstar-football-management','events',id,1))<>count_before then raise exception 'Read changed events'; end if;
  begin
    perform public.redream_documents('northstar-football-management','save',id,0,jsonb_build_object('kind','player_contract','title','[QA] Duplicate attempt','content',content));
    raise exception 'Duplicate create accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%already in use%' then raise; end if;
  end;
  doc:=public.redream_documents('northstar-football-management','save',id,1,jsonb_build_object('title','[QA] Confirmed revision two','content',content));
  result:=public.redream_document_read('northstar-football-management',id);
  if (result->'document'->>'revision')::int is distinct from 2 or result->'document'->>'title' is distinct from '[QA] Confirmed revision two' then raise exception 'Update confirmation mismatch'; end if;
  begin
    perform public.redream_documents('northstar-football-management','save',id,1,jsonb_build_object('title','[QA] Stale write','content',content));
    raise exception 'Stale revision accepted';
  exception when sqlstate '40001' then null;
  end;
  if jsonb_array_length(public.redream_documents('northstar-football-management','events',id,2))<>2 then raise exception 'Duplicate write/event'; end if;
  result:=public.redream_document_read('djm-sports-management',id);
  if result->>'state' is distinct from 'missing' or result->'document' is distinct from 'null'::jsonb then raise exception 'Foreign document exposure'; end if;
  perform public.redream_documents('northstar-football-management','archive',id,2);
  result:=public.redream_document_read('northstar-football-management',id);
  if result->>'state' is distinct from 'archived' or result->'document' is distinct from 'null'::jsonb then raise exception 'Archived content exposed'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.redream_document_read('northstar-football-management',id);
    raise exception 'Nonmember admitted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.redream_document_read('northstar-football-management',id);
    raise exception 'Anonymous claim admitted';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon','public.redream_document_read(text,uuid)','EXECUTE') then raise exception 'Anonymous execute grant'; end if;
  perform set_config('redream.document_confirmation_qa','missing/create/read-only/update/stable-ID/stale-revision/foreign/archive/nonmember/anonymous: pass',true);
end $qa$;
select current_setting('redream.document_confirmation_qa') as result;
rollback;
