begin;

-- Frozen ISO 4217 numeric minor units from SIX List One, published 2026-09-17.
-- Source: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
-- Source SHA-256: 33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff
-- No existing rows or snapshots are rewritten. No client grants are added.
do $helper$
declare existing pg_proc%rowtype;
begin
  select * into existing from pg_proc where oid=to_regprocedure('private.invoice_currency_minor_unit_v1(text)');
  if found then
    if md5(existing.prosrc)<>'7a55e13cc590c2bf75c885bab12cadfc' or existing.prosecdef or not existing.proisstrict
      or existing.provolatile<>'i' or existing.proconfig is distinct from array['search_path=""']::text[]
      or existing.proowner<>(select proowner from pg_proc where oid='public.redream_documents(text,text,uuid,integer,jsonb)'::regprocedure)
      then raise exception 'Unexpected invoice currency lookup contract'; end if;
  else
    execute $definition$create function private.invoice_currency_minor_unit_v1(p_currency text)
returns integer language sql immutable strict security invoker set search_path='' as $currency$
  select case
    when p_currency=any(array['BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF']) then 0
    when p_currency=any(array['AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BMD','BND','BOB','BOV','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHE','CHF','CHW','CNY','COP','COU','CRC','CUP','CVE','CZK','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IRR','JMD','KES','KGS','KHR','KPW','KYD','KZT','LAK','LBP','LKR','LRD','LSL','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MXV','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','PAB','PEN','PGK','PHP','PKR','PLN','QAR','RON','RSD','RUB','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TOP','TRY','TTD','TWD','TZS','UAH','USD','USN','UYU','UZS','VED','VES','WST','XAD','XCD','XCG','YER','ZAR','ZMW','ZWG']) then 2
    when p_currency=any(array['BHD','IQD','JOD','KWD','LYD','OMR','TND']) then 3
    when p_currency=any(array['CLF','UYW']) then 4
    else null end;
$currency$;$definition$;
  end if;
end $helper$;
revoke all on function private.invoice_currency_minor_unit_v1(text) from public,anon,authenticated,service_role;

-- Patch only verified function bodies. All changes roll back together on drift.
-- The capability header prevents accidental stale-client arithmetic; it grants no access.
do $patch$
declare
  spec record;
  change jsonb;
  target regprocedure;
  original pg_proc%rowtype;
  updated pg_proc%rowtype;
  patched text;
begin
  if (select proowner from pg_proc where oid='private.invoice_currency_minor_unit_v1(text)'::regprocedure)
    <> (select proowner from pg_proc where oid='public.redream_documents(text,text,uuid,integer,jsonb)'::regprocedure) then
    raise exception 'Unexpected invoice currency lookup owner';
  end if;
  for spec in select * from (values
    ('public.redream_documents(text,text,uuid,integer,jsonb)', '3bd8623f7cb0bac0a722f7dcb389abc2', '7ad3eac7c7a18ce5c2ea2ce7dff8d247', true, 'v', $changes$[{"old":"invoice_subtotal numeric;","new":"invoice_subtotal numeric; invoice_digits integer; invoice_scale numeric;"},{"old":"    if jsonb_array_length(doc.content->'lines')=0 or exists(select 1 from jsonb_array_elements(doc.content->'lines') line where coalesce(trim(line->>'description'),'')='' or coalesce(line->>'quantity','')!~'^\\d{1,9}(\\.\\d{1,3})?$' or coalesce(line->>'unitPrice','')!~'^\\d{1,9}(\\.\\d{1,2})?$') then raise exception 'Check invoice line items'; end if;\n    if doc.content->'fields'->>'currency' !~ '^[A-Z]{3}$' or coalesce(doc.content->'fields'->>'tax_rate','0')!~'^\\d{1,3}(\\.\\d{1,2})?$' then raise exception 'Check invoice currency and tax'; end if;\n    select sum(round((line->>'quantity')::numeric*(line->>'unitPrice')::numeric*100)) into invoice_subtotal from jsonb_array_elements(doc.content->'lines') line;\n","new":"    if doc.content->'fields'->>'currency' !~ '^[A-Z]{3}$' or coalesce(nullif(doc.content->'fields'->>'tax_rate',''),'0')!~'^\\d{1,3}(\\.\\d{1,2})?$' then raise exception 'Check invoice currency and tax'; end if;\n    if doc.content ? 'invoiceCurrencyVersion' and doc.content->'invoiceCurrencyVersion' <> '1'::jsonb then\n      raise exception 'Duplicate this invoice to use current currency precision';\n    end if;\n    if doc.content ? 'invoiceCurrencyVersion' then\n      invoice_digits:=private.invoice_currency_minor_unit_v1(doc.content->'fields'->>'currency');\n      if invoice_digits is null then raise exception 'Choose a supported invoice currency'; end if;\n    else\n      -- Historical manual records retain the original two-decimal amount.\n      -- Only a new recipient snapshot requires an explicitly reviewed new copy.\n      if p_action='share' and private.invoice_currency_minor_unit_v1(doc.content->'fields'->>'currency') is distinct from 2 then\n        raise exception 'Duplicate this invoice to use current currency precision';\n      end if;\n      invoice_digits:=2;\n    end if;\n    invoice_scale:=power(10::numeric,invoice_digits);\n    if jsonb_array_length(doc.content->'lines')=0 or exists(\n      select 1 from jsonb_array_elements(doc.content->'lines') line\n      where coalesce(trim(line->>'description'),'')=''\n        or coalesce(trim(line->>'quantity'),'')!~'^\\d{1,9}(\\.\\d{1,3})?$'\n        or coalesce(trim(line->>'unitPrice'),'')!~case when doc.content ? 'invoiceCurrencyVersion' then '^\\d{1,9}(\\.\\d{1,9})?$' else '^\\d{1,9}(\\.\\d{1,2})?$' end\n    ) then raise exception 'Check invoice line items'; end if;\n    if exists(select 1 from jsonb_array_elements(doc.content->'lines') line where (line->>'unitPrice')::numeric*invoice_scale<>trunc((line->>'unitPrice')::numeric*invoice_scale)) then\n      raise exception 'Check unit prices for the invoice currency';\n    end if;\n    select sum(round((line->>'quantity')::numeric*(line->>'unitPrice')::numeric*invoice_scale)) into invoice_subtotal from jsonb_array_elements(doc.content->'lines') line;\n"},{"old":"  if doc.kind='invoice' then\n","new":"  if doc.kind='invoice' then\n    if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-redream-invoice-currency','')<>'1' and doc.content->'invoiceCurrencyVersion'='1'::jsonb and private.invoice_currency_minor_unit_v1(doc.content->'fields'->>'currency') is distinct from 2 then\n      raise exception 'Refresh ReDream to open these invoices';\n    end if;\n"},{"old":"  if p_action='list' then\n","new":"  if p_action='list' then\n    -- Old cached clients must not render a new amount using their fixed scale.\n    if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-redream-invoice-currency','')<>'1' then\n      if exists(select 1 from public.agency_documents d where d.tenant_id=tenant and d.archived_at is null\n        and d.kind='invoice' and d.content->'invoiceCurrencyVersion'='1'::jsonb and private.invoice_currency_minor_unit_v1(d.content->'fields'->>'currency') is distinct from 2) then\n        raise exception 'Refresh ReDream to open these invoices';\n      end if;\n    end if;\n"},{"old":"    if p_revision=0 then\n","new":"    if p_revision=0 then\n      if p_payload->>'kind'='invoice' then\n        if not (p_payload->'content' ? 'invoiceCurrencyVersion') then\n          p_payload:=jsonb_set(p_payload,'{content,invoiceCurrencyVersion}','1'::jsonb);\n        elsif p_payload->'content'->'invoiceCurrencyVersion' is distinct from '1'::jsonb then\n          raise exception 'Use a supported invoice amount format';\n        end if;\n      end if;\n"},{"old":"      perform 1 from public.agency_documents where id=p_id and tenant_id=tenant for update;","new":"      select * into doc from public.agency_documents where id=p_id and tenant_id=tenant for update;"},{"old":"      if exists(select 1 from public.agency_document_events where document_id=p_id and tenant_id=tenant and kind='paid_manually') then raise exception 'This invoice has a recorded payment. Duplicate it to create a revised document.'; end if;\n","new":"      if exists(select 1 from public.agency_document_events where document_id=p_id and tenant_id=tenant and kind='paid_manually') then raise exception 'This invoice has a recorded payment. Duplicate it to create a revised document.'; end if;\n      if doc.kind='invoice' and doc.revision=p_revision and doc.archived_at is null then\n        if doc.content->'invoiceCurrencyVersion'='1'::jsonb then\n          if not (p_payload->'content' ? 'invoiceCurrencyVersion') then\n            p_payload:=jsonb_set(p_payload,'{content,invoiceCurrencyVersion}','1'::jsonb);\n          elsif p_payload->'content'->'invoiceCurrencyVersion' is distinct from '1'::jsonb then\n            raise exception 'Use a supported invoice amount format';\n          end if;\n        elsif doc.content ? 'invoiceCurrencyVersion' then\n          raise exception 'Use a supported invoice amount format';\n        elsif p_payload->'content' ? 'invoiceCurrencyVersion' then\n          raise exception 'Duplicate this invoice to use current currency precision';\n        end if;\n      end if;\n"},{"old":"    return to_jsonb(doc);\n","new":"    if doc.kind='invoice' then\n      if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-redream-invoice-currency','')<>'1' and doc.content->'invoiceCurrencyVersion'='1'::jsonb and private.invoice_currency_minor_unit_v1(doc.content->'fields'->>'currency') is distinct from 2 then\n        raise exception 'Refresh ReDream to open these invoices';\n      end if;\n    end if;\n    return to_jsonb(doc);\n"}]$changes$::jsonb),
    ('private.document_studio_snapshot(public.agency_documents)', 'a8a36dee47211a88cdd418939b910f2a', 'e26630eceeee31fabe8356d9a5ce7810', false, 'v', $changes$[{"old":"'lines',case when p_doc.kind='invoice' then p_doc.content->'lines' else '[]'::jsonb end,'reviewed',true));","new":"'lines',case when p_doc.kind='invoice' then p_doc.content->'lines' else '[]'::jsonb end,'reviewed',true) ||\n    case when p_doc.kind='invoice' and p_doc.content->'invoiceCurrencyVersion'='1'::jsonb\n      then jsonb_build_object('invoiceCurrencyVersion',1) else '{}'::jsonb end);"}]$changes$::jsonb),
    ('public.redream_document_read(text,uuid)', '86c2a5c5ea0e7597d2d60d27c00a8790', '9e96a273a265780b6230dc1a9d6d23ad', true, 's', $changes$[{"old":"  if doc.archived_at is not null then return jsonb_build_object('tenant_id',tenant,'state','archived','document',null); end if;\n","new":"  if doc.archived_at is not null then return jsonb_build_object('tenant_id',tenant,'state','archived','document',null); end if;\n  if doc.kind='invoice' then\n    if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-redream-invoice-currency','')<>'1' and doc.content->'invoiceCurrencyVersion'='1'::jsonb and private.invoice_currency_minor_unit_v1(doc.content->'fields'->>'currency') is distinct from 2 then\n      raise exception 'Refresh ReDream to open these invoices';\n    end if;\n  end if;\n"}]$changes$::jsonb),
    ('public.redream_document_open(text,text)', 'f8ac8e68697fb3fae6be17f11471d4f4', '0f94eb02ac637e50d29d965ad2a70ae5', true, 'v', $changes$[{"old":"  if not found then return null; end if;\n","new":"  if not found then return null; end if;\n  if link.snapshot->>'kind'='invoice' then\n    if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-redream-invoice-currency','')<>'1' and (link.snapshot->'content')->'invoiceCurrencyVersion'='1'::jsonb and private.invoice_currency_minor_unit_v1((link.snapshot->'content')->'fields'->>'currency') is distinct from 2 then\n      raise exception 'Refresh ReDream to open these invoices';\n    end if;\n  end if;\n"}]$changes$::jsonb)
  ) patches(signature,old_hash,new_hash,security_definer,volatility,changes) loop
    target:=spec.signature::regprocedure;
    select * into strict original from pg_proc where oid=target;
    if original.proconfig is distinct from array['search_path=""']::text[]
      or original.provolatile::text<>spec.volatility or original.prosecdef<>spec.security_definer then
      raise exception 'Unexpected document function security settings: %',spec.signature;
    end if;
    if md5(original.prosrc)=spec.new_hash then continue; end if;
    if md5(original.prosrc)<>spec.old_hash then raise exception 'Unexpected document function source: %',spec.signature; end if;
    patched:=original.prosrc;
    for change in select value from jsonb_array_elements(spec.changes) loop
      if (length(patched)-length(replace(patched,change->>'old','')))/length(change->>'old')<>1 then
        raise exception 'Expected one invoice currency anchor: %',spec.signature;
      end if;
      patched:=replace(patched,change->>'old',change->>'new');
    end loop;
    if md5(patched)<>spec.new_hash then raise exception 'Unexpected invoice currency patch: %',spec.signature; end if;
    execute replace(pg_get_functiondef(target),original.prosrc,patched);
    select * into strict updated from pg_proc where oid=target;
    if updated.proowner<>original.proowner or updated.proacl is distinct from original.proacl
      or updated.proconfig is distinct from original.proconfig or updated.prosecdef<>original.prosecdef
      or updated.provolatile<>original.provolatile or updated.prosrc<>patched then
      raise exception 'Invoice precision patch changed the function contract: %',spec.signature;
    end if;
  end loop;
end $patch$;

commit;
