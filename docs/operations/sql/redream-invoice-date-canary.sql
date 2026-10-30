-- Staging ltvmopvarlnidiozvpow only. Fictional invoice; every write rolls back.
-- No recipient is contacted, token returned, obligation created or money moved.
begin;
select set_config('request.jwt.claim.sub','675c4f97-f5b9-4686-912f-938b01b4df18',true);
set local role authenticated;
do $qa$
declare id uuid:=gen_random_uuid(); doc jsonb; result jsonb; sample record; action text;
  before_events jsonb;
  content jsonb:='{"brand":{"name":"Northstar Football Management","legalName":"Northstar Football Management","logoUrl":"","primary":"#24143D","accent":"#8B6CDA","email":"qa@example.test","phone":"","website":"","address":"","registration":"","bankDetails":"QA TEST ONLY, not an account"},"fields":{"invoice_number":"","recipient_name":"QA fictional club, no payment requested","recipient_address":"QA fictional address","currency":"EUR","tax_rate":"20","issue_date":"2026-11-01","due_date":"2026-10-31"},"sections":[{"id":"qa","title":"QA software test only","body":"Fictional software validation. No services, obligation, payment or external send."}],"lines":[{"id":"qa","description":"QA fictional service","quantity":"1.5","unitPrice":"100.01"}],"sources":[],"reviewed":true}';
begin
  if current_user<>'authenticated' then raise exception 'Actual authenticated role required'; end if;
  content:=jsonb_set(content,'{fields,invoice_number}',to_jsonb('QA-DATE-'||id::text));
  doc:=public.redream_documents('northstar-football-management','save',id,0,jsonb_build_object('kind','invoice','title','[QA] Invoice date rollback canary','content',content));
  for sample in select * from (values
    ('2026-11-01','2026-10-31','Due date must be on or after the issue date'),
    ('2026-02-31','2026-11-01','Use valid invoice dates'),
    ('2026-11-01','2026-11-31','Use valid invoice dates'),
    ('2026-2-01','2026-11-01','Use valid invoice dates'),
    ('0000-01-01','2026-11-01','Use valid invoice dates')
  ) as dates(issue,due,message) loop
    content:=jsonb_set(jsonb_set(content,'{fields,issue_date}',to_jsonb(sample.issue)),'{fields,due_date}',to_jsonb(sample.due));
    doc:=public.redream_documents('northstar-football-management','save',id,(doc->>'revision')::int,jsonb_build_object('title','[QA] Invoice date rollback canary','content',content));
    result:=public.redream_document_read('northstar-football-management',id);
    if result->'document'->'content' is distinct from content then raise exception 'Invalid draft did not remain editable'; end if;
    before_events:=public.redream_documents('northstar-football-management','events',id,(doc->>'revision')::int);
    foreach action in array array['share','sent','paid'] loop
      begin
        perform public.redream_documents('northstar-football-management',action,id,(doc->>'revision')::int,'{"note":"QA rollback only, no real financial event"}');
        raise exception 'Invalid invoice date accepted for %',action;
      exception when sqlstate 'P0001' then
        if sqlerrm<>sample.message then raise; end if;
      end;
    end loop;
    if public.redream_documents('northstar-football-management','events',id,(doc->>'revision')::int) is distinct from before_events then raise exception 'Rejected action changed events'; end if;
  end loop;
  content:=jsonb_set(jsonb_set(content,'{fields,issue_date}','"2028-02-29"'),'{fields,due_date}','"2028-02-29"');
  doc:=public.redream_documents('northstar-football-management','save',id,(doc->>'revision')::int,jsonb_build_object('title','[QA] Invoice date rollback canary','content',content));
  begin
    perform public.redream_documents('northstar-football-management','save',gen_random_uuid(),0,jsonb_build_object('kind','invoice','title','[QA] Duplicate number rollback','content',content));
    raise exception 'Duplicate invoice number admitted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%already in use%' then raise; end if;
  end;
  result:=public.redream_documents('northstar-football-management','share',id,(doc->>'revision')::int);
  if length(result->>'token')<>64 then raise exception 'Valid same-day leap invoice rejected'; end if;
  perform public.redream_documents('northstar-football-management','sent',id,(doc->>'revision')::int,'{"note":"QA rollback only, no external send"}');
  perform public.redream_documents('northstar-football-management','paid',id,(doc->>'revision')::int,'{"note":"QA rollback only, no money moved"}');
  begin
    perform public.redream_documents('northstar-football-management','paid',id,(doc->>'revision')::int,'{"note":"QA repeat rejected"}');
    raise exception 'Repeated payment admitted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%already been recorded%' then raise; end if;
  end;
  result:=public.redream_document_read('djm-sports-management',id);
  if result->>'state' is distinct from 'missing' or result->'document' is distinct from 'null'::jsonb then raise exception 'Foreign invoice exposure'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.redream_documents('northstar-football-management','list');
    raise exception 'Nonmember admitted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.redream_documents('northstar-football-management','list');
    raise exception 'Anonymous claim admitted';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon','public.redream_documents(text,text,uuid,integer,jsonb)','EXECUTE') then raise exception 'Anonymous execute grant'; end if;
  perform set_config('redream.invoice_date_qa','invalid-editable-drafts/invalid-share-sent-paid/no-extra-events/same-day-leap/unique-number/manual-repeat/foreign/nonmember/anonymous: pass',true);
end $qa$;
select current_setting('redream.invoice_date_qa') as result;
rollback;
