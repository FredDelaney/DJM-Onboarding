-- Staging ltvmopvarlnidiozvpow only. All synthetic rows/tokens/events roll back.
-- No recipient, payment URL, obligation, external send or money movement.
begin;
-- An explicit pre-upgrade fixture, never an alteration of an existing invoice.
do $legacy$
declare id uuid:=gen_random_uuid();
begin
  insert into public.agency_documents(id,tenant_id,kind,title,content,created_by)
  values(id,(select t.id from platform.tenants t where t.slug='northstar-football-management'),'invoice','[QA] Historical currency rollback',
    '{"brand":{"name":"QA fictional agency","legalName":"QA fictional agency","primary":"#23483F","accent":"#B49568","logoUrl":"","email":"qa@example.test","phone":"","website":"","address":"","registration":"","bankDetails":"QA only, not an account"},"fields":{"invoice_number":"QA-HISTORICAL-ROLLBACK","recipient_name":"QA club","recipient_address":"QA address","currency":"KWD","tax_rate":"0","issue_date":"2026-11-01","due_date":"2026-11-01"},"sections":[{"id":"qa","title":"QA only","body":"Fictional historical fixture; no obligation."}],"lines":[{"id":"qa","description":"QA historical amount","quantity":"1.5","unitPrice":"1.23"}],"sources":[],"reviewed":true}',
    '675c4f97-f5b9-4686-912f-938b01b4df18');
  perform set_config('redream.currency_legacy_id',id::text,true);
end $legacy$;
select set_config('request.jwt.claim.sub','675c4f97-f5b9-4686-912f-938b01b4df18',true);
select set_config('request.headers','{"x-redream-invoice-currency":"1"}',true);
set local role authenticated;
do $qa$
declare id uuid; doc jsonb; result jsonb; snapshot jsonb; sample record; action text; before_events jsonb;
  content jsonb:='{"brand":{"name":"QA fictional agency","legalName":"QA fictional agency","primary":"#23483F","accent":"#B49568","logoUrl":"","email":"qa@example.test","phone":"","website":"","address":"","registration":"","bankDetails":"QA only, not an account"},"fields":{"invoice_number":"","recipient_name":"QA fictional club","recipient_address":"QA address","currency":"EUR","tax_rate":"20","issue_date":"2026-11-01","due_date":"2026-11-01"},"sections":[{"id":"qa","title":"QA software test only","body":"Fictional software validation; no services, obligation or payment."}],"lines":[{"id":"qa","description":"QA currency evaluation","quantity":"1","unitPrice":"1"}],"sources":[],"reviewed":true}';
begin
  if current_user<>'authenticated' then raise exception 'Actual authenticated role required'; end if;
  for sample in select * from (values
    ('JPY','100','2.5','100.01'),('EUR','100.10','2.5','100.101'),
    ('KWD','1.234','1.5','1.2341'),('CLF','1.2345','1.5','1.23451')
  ) prices(currency,price,quantity,bad_price) loop
    id:=gen_random_uuid();
    content:=jsonb_set(jsonb_set(content,'{fields,invoice_number}',to_jsonb('QA-CURRENCY-'||id::text)),'{fields,currency}',to_jsonb(sample.currency));
    content:=jsonb_set(jsonb_set(content,'{lines,0,unitPrice}',to_jsonb(sample.price)),'{lines,0,quantity}',to_jsonb(sample.quantity));
    -- An omitted marker is defaulted by the server, never a legacy bypass.
    doc:=public.redream_documents('northstar-football-management','save',id,0,jsonb_build_object('kind','invoice','title','[QA] Currency rollback','content',content));
    if doc->'content'->'invoiceCurrencyVersion' is distinct from '1'::jsonb then raise exception 'Missing server currency version'; end if;
    begin
      perform public.redream_documents('northstar-football-management','save',id,(doc->>'revision')::int,jsonb_build_object('title','QA rejected format change','content',content||'{"invoiceCurrencyVersion":2}'::jsonb));
      raise exception 'Unsupported monetary format admitted';
    exception when sqlstate 'P0001' then if sqlerrm<>'Use a supported invoice amount format' then raise; end if; end;
    result:=public.redream_documents('northstar-football-management','share',id,(doc->>'revision')::int);
    snapshot:=public.redream_document_open('northstar-football-management',result->>'token');
    if snapshot->'content'->'invoiceCurrencyVersion' is distinct from '1'::jsonb
      or snapshot->'content'->'lines' is distinct from content->'lines' then raise exception 'Snapshot precision lost'; end if;
    perform set_config('redream.currency_token',result->>'token',true);
    perform set_config('redream.currency_snapshot',snapshot::text,true);
    content:=jsonb_set(content,'{lines,0,unitPrice}',to_jsonb(sample.bad_price));
    doc:=public.redream_documents('northstar-football-management','save',id,(doc->>'revision')::int,jsonb_build_object('title','[QA] Currency rollback','content',content));
    before_events:=public.redream_documents('northstar-football-management','events',id,(doc->>'revision')::int);
    foreach action in array array['share','sent','paid'] loop
      begin
        perform public.redream_documents('northstar-football-management',action,id,(doc->>'revision')::int,'{"note":"QA rollback only"}');
        raise exception 'Invalid price admitted';
      exception when sqlstate 'P0001' then if sqlerrm<>'Check unit prices for the invoice currency' then raise; end if; end;
    end loop;
    if public.redream_documents('northstar-football-management','events',id,(doc->>'revision')::int) is distinct from before_events then raise exception 'Rejected price created an event'; end if;
    content:=jsonb_set(content,'{lines,0,unitPrice}',to_jsonb(sample.price));
    doc:=public.redream_documents('northstar-football-management','save',id,(doc->>'revision')::int,jsonb_build_object('title','[QA] Currency rollback','content',content));
    if sample.currency<>'EUR' then
      perform set_config('request.headers','{}',true);
      foreach action in array array['list','share','sent','paid','save'] loop
        begin
          perform public.redream_documents('northstar-football-management',action,id,(doc->>'revision')::int,jsonb_build_object('title','QA rejected old client','content',content,'note','QA rollback only'));
          raise exception 'Stale client admitted';
        exception when sqlstate 'P0001' then if sqlerrm<>'Refresh ReDream to open these invoices' then raise; end if; end;
      end loop;
      begin
        perform public.redream_document_read('northstar-football-management',id);
        raise exception 'Stale exact read admitted';
      exception when sqlstate 'P0001' then if sqlerrm<>'Refresh ReDream to open these invoices' then raise; end if; end;
      perform set_config('request.headers','{"x-redream-invoice-currency":"1"}',true);
      result:=public.redream_document_read('northstar-football-management',id);
      if result->'document'->>'title'<>'[QA] Currency rollback' then raise exception 'Rejected stale save persisted'; end if;
    end if;
    perform public.redream_documents('northstar-football-management','sent',id,(doc->>'revision')::int,'{"note":"QA rollback, no send"}');
    perform public.redream_documents('northstar-football-management','paid',id,(doc->>'revision')::int,'{"note":"QA rollback, no payment"}');
    begin
      perform public.redream_documents('northstar-football-management','save',id,(doc->>'revision')::int,jsonb_build_object('title','QA rejected paid edit','content',content));
      raise exception 'Paid edit admitted';
    exception when sqlstate 'P0001' then if sqlerrm not like '%recorded payment%' then raise; end if; end;
    result:=public.redream_document_read('djm-sports-management',id);
    if result->>'state' is distinct from 'missing' then raise exception 'Foreign invoice exposed'; end if;
  end loop;
  id:=current_setting('redream.currency_legacy_id')::uuid;
  perform set_config('request.headers','{}',true);
  doc:=public.redream_document_read('northstar-football-management',id)->'document';
  if doc->'content' ? 'invoiceCurrencyVersion' then raise exception 'Historical format rewritten'; end if;
  begin
    perform public.redream_documents('northstar-football-management','share',id,(doc->>'revision')::int);
    raise exception 'New legacy share admitted';
  exception when sqlstate 'P0001' then if sqlerrm<>'Duplicate this invoice to use current currency precision' then raise; end if; end;
  begin
    perform public.redream_documents('northstar-football-management','save',id,(doc->>'revision')::int,jsonb_build_object('title','QA rejected legacy reinterpretation','content',(doc->'content')||'{"invoiceCurrencyVersion":1}'::jsonb));
    raise exception 'Legacy reinterpretation admitted';
  exception when sqlstate 'P0001' then if sqlerrm<>'Duplicate this invoice to use current currency precision' then raise; end if; end;
  perform public.redream_documents('northstar-football-management','paid',id,(doc->>'revision')::int,'{"note":"QA original KWD 1.85 only, no payment"}');
  if public.redream_document_read('northstar-football-management',id)->'document'->'content' is distinct from doc->'content' then raise exception 'Historical amount changed'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.redream_documents('northstar-football-management','list');raise exception 'Nonmember admitted';
  exception when insufficient_privilege then null; end;
  perform set_config('redream.currency_qa','four-scales/server-default/immutable-format/invalid-price/no-extra-event/cached-client/paid-lock/historical-manual/foreign/nonmember/anonymous: pass',true);
end $qa$;
set local role anon;
do $anon$
declare snapshot jsonb;
begin
  begin
    perform public.redream_documents('northstar-football-management','list');raise exception 'Anonymous writer admitted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.redream_document_read('northstar-football-management',gen_random_uuid());raise exception 'Anonymous reader admitted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.redream_document_open('northstar-football-management',current_setting('redream.currency_token'));raise exception 'Stale recipient admitted';
  exception when sqlstate 'P0001' then if sqlerrm<>'Refresh ReDream to open these invoices' then raise; end if; end;
  perform set_config('request.headers','{"x-redream-invoice-currency":"1"}',true);
  snapshot:=public.redream_document_open('northstar-football-management',current_setting('redream.currency_token'));
  if snapshot is distinct from current_setting('redream.currency_snapshot')::jsonb then raise exception 'Recipient amount changed'; end if;
  if public.redream_document_open('djm-sports-management',current_setting('redream.currency_token')) is not null then raise exception 'Foreign recipient admitted'; end if;
end $anon$;
select current_setting('redream.currency_qa') as result;
rollback;
