begin;

create table public.agency_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  kind text not null check (kind in ('player_contract','mandate','agency_pitch','invoice','scouting_report')),
  title text not null check (length(title) between 1 and 180),
  is_template boolean not null default false,
  status text not null default 'draft' check (status in ('draft','ready')),
  content jsonb not null check (jsonb_typeof(content)='object' and octet_length(content::text)<=200000),
  revision integer not null default 1 check (revision>0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(id,tenant_id)
);
create index agency_documents_tenant_updated on public.agency_documents(tenant_id,updated_at desc) where archived_at is null;
create unique index agency_documents_invoice_number on public.agency_documents(tenant_id,lower(content->'fields'->>'invoice_number'))
  where kind='invoice' and not is_template and archived_at is null and coalesce(content->'fields'->>'invoice_number','')<>'';

create table public.agency_document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  tenant_id uuid not null,
  token_hash text not null unique,
  snapshot jsonb not null,
  document_revision integer not null,
  expires_at timestamptz not null default now()+interval '14 days',
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(document_id,tenant_id) references public.agency_documents(id,tenant_id) on delete cascade
);
create index agency_document_shares_document on public.agency_document_shares(document_id,tenant_id);
create table public.agency_document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  tenant_id uuid not null,
  share_id uuid references public.agency_document_shares(id) on delete cascade,
  kind text not null check(kind in ('created','saved','link_created','link_revoked','opened','sent_manually','paid_manually')),
  actor_id uuid references auth.users(id) on delete set null,
  document_revision integer not null,
  note text check(length(note)<=500),
  created_at timestamptz not null default now(),
  foreign key(document_id,tenant_id) references public.agency_documents(id,tenant_id) on delete cascade
);
create index agency_document_events_document on public.agency_document_events(tenant_id,document_id,created_at desc);
-- One open event per link avoids duplicate React mounts and anonymous event spam.
create unique index agency_document_events_first_open on public.agency_document_events(share_id) where kind='opened';

alter table public.agency_documents enable row level security;
alter table public.agency_document_shares enable row level security;
alter table public.agency_document_events enable row level security;
revoke all on public.agency_documents,public.agency_document_shares,public.agency_document_events from public,anon,authenticated;
grant all on public.agency_documents,public.agency_document_shares,public.agency_document_events to service_role;
create policy document_admin_read on public.agency_documents for select to authenticated using(private.user_is_tenant_admin(tenant_id,(select auth.uid())));
create policy document_share_admin_read on public.agency_document_shares for select to authenticated using(private.user_is_tenant_admin(tenant_id,(select auth.uid())));
create policy document_event_admin_read on public.agency_document_events for select to authenticated using(private.user_is_tenant_admin(tenant_id,(select auth.uid())));

create function private.document_studio_validate(p_content jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
  if jsonb_typeof(p_content) is distinct from 'object'
    or jsonb_typeof(p_content->'brand') is distinct from 'object'
    or jsonb_typeof(p_content->'fields') is distinct from 'object'
    or jsonb_typeof(p_content->'sections') is distinct from 'array'
    or jsonb_typeof(p_content->'lines') is distinct from 'array'
    or jsonb_typeof(p_content->'sources') is distinct from 'array'
    or octet_length(p_content::text)>200000 then raise exception 'Invalid document content'; end if;
  if jsonb_array_length(p_content->'sections')>30 or jsonb_array_length(p_content->'lines')>30 or jsonb_array_length(p_content->'sources')>30 then raise exception 'Document limit reached'; end if;
  for item in select value from jsonb_each(p_content->'fields') loop
    if jsonb_typeof(item)<>'string' or length(item#>>'{}')>10000 then raise exception 'Invalid document field'; end if;
  end loop;
  for item in select value from jsonb_each(p_content->'brand') loop
    if jsonb_typeof(item)<>'string' or length(item#>>'{}')>10000 then raise exception 'Invalid agency branding'; end if;
  end loop;
  if coalesce(p_content->'brand'->>'primary','')!~'^#[0-9a-fA-F]{6}$' or coalesce(p_content->'brand'->>'accent','')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Use six-digit agency colours'; end if;
  for item in select value from jsonb_array_elements(p_content->'sections') loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'body') is distinct from 'string'
      or length(item->>'title')>200 or length(item->>'body')>20000 then raise exception 'Invalid document section'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_content->'lines') loop
    if jsonb_typeof(item->'description') is distinct from 'string' or jsonb_typeof(item->'quantity') is distinct from 'string' or jsonb_typeof(item->'unitPrice') is distinct from 'string' then raise exception 'Invalid invoice item'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_content->'sources') loop
    if jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'url') is distinct from 'string' or jsonb_typeof(item->'capturedAt') is distinct from 'string' then raise exception 'Invalid document source'; end if;
  end loop;
end $$;
revoke all on function private.document_studio_validate(jsonb) from public,anon,authenticated;

-- The external DTO contains only the chosen document, never operational player
-- records, unused fields, event actors or credentials. Bank details are invoice-only.
create function private.document_studio_snapshot(p_doc public.agency_documents)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare keys text[]; fields jsonb; brand jsonb;
begin
  keys:=case p_doc.kind
    when 'player_contract' then array['player_name','player_dob','start_date','end_date','commission']
    when 'mandate' then array['principal_name','principal_type','player_name','territory','start_date','end_date','commission']
    when 'agency_pitch' then array['player_name','player_club','position','purpose']
    when 'invoice' then array['invoice_number','recipient_name','recipient_address','recipient_email','issue_date','due_date','currency','tax_rate','payment_url','reference']
    else array['player_name','player_club','position','recipient_name','report_date','author'] end;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into fields from jsonb_each(p_doc.content->'fields') where key=any(keys);
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into brand from jsonb_each(p_doc.content->'brand')
    where key=any(array['name','legalName','logoUrl','primary','accent','email','phone','website','address','registration']) or (key='bankDetails' and p_doc.kind='invoice');
  return jsonb_build_object('title',p_doc.title,'kind',p_doc.kind,'status','ready','content',jsonb_build_object(
    'brand',brand,'fields',fields,'sections',p_doc.content->'sections','sources',p_doc.content->'sources',
    'lines',case when p_doc.kind='invoice' then p_doc.content->'lines' else '[]'::jsonb end,'reviewed',true));
end $$;
revoke all on function private.document_studio_snapshot(public.agency_documents) from public,anon,authenticated;

-- Deliberate privileged API: raw tables are not exposed. Every action starts
-- with an authenticated active owner/admin check for the explicitly selected tenant.
create function public.redream_documents(p_workspace_slug text,p_action text default 'list',p_id uuid default null,p_revision integer default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; actor uuid:=auth.uid(); doc public.agency_documents; token text; share_id uuid; key text; required text[]; var text; brand jsonb; invoice_subtotal numeric;
begin
  if actor is null then raise exception 'Sign in to open documents' using errcode='42501'; end if;
  select id into tenant from platform.tenants where slug=p_workspace_slug and status='active';
  if tenant is null or not private.user_is_tenant_admin(tenant,actor) then raise exception 'Documents are available to workspace owners and admins' using errcode='42501'; end if;
  if p_action='list' then
    select jsonb_build_object('display_name',b.display_name,'legal_name',coalesce(b.legal_name,t.legal_name,b.display_name),'logo_asset',b.logo_asset,'primary_color',b.primary_color,'accent_color',b.accent_color,'support_email',b.support_email,'phone',b.phone,'website_url',b.website_url)
      into brand from platform.tenants t left join platform.tenant_branding b on b.tenant_id=t.id where t.id=tenant;
    return jsonb_build_object('tenant_id',tenant,'brand',brand,
      'settings',coalesce((select jsonb_build_object('default_currency',s.default_currency,'timezone',s.timezone) from platform.tenant_settings s where s.tenant_id=tenant),'{}'::jsonb),
      'documents',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object(
        'opened_at',(select min(created_at) from public.agency_document_events e where e.document_id=d.id and e.document_revision=d.revision and e.kind='opened'),
        'paid_at',(select max(created_at) from public.agency_document_events e where e.document_id=d.id and e.kind='paid_manually'),
        'sent_at',(select max(created_at) from public.agency_document_events e where e.document_id=d.id and e.document_revision=d.revision and e.kind='sent_manually'),
        'active_links',(select count(*) from public.agency_document_shares s where s.document_id=d.id and s.revoked_at is null and s.expires_at>now())) order by d.updated_at desc)
        from (select id,title,kind,is_template,status,content,revision,updated_at from public.agency_documents where tenant_id=tenant and archived_at is null order by updated_at desc limit 100) d),'[]'::jsonb),
      'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Unnamed player'),'dob',p.date_of_birth,
        'profile',case when pp.published then private.visible_public_player_profile(jsonb_build_object('current_club',pp.current_club,'primary_position',pp.primary_position,'career_summary',pp.career_summary,'key_stats',pp.key_stats,'transfermarkt_url',pp.transfermarkt_url,'hidden_sections',pp.hidden_sections)) else null end) order by p.last_name,p.first_name)
        from public.players p left join public.player_public_profiles pp on pp.player_id=p.id where p.tenant_id=tenant and p.archived_at is null),'[]'::jsonb));
  end if;
  if p_action='save' then
    perform private.document_studio_validate(p_payload->'content');
    if coalesce(trim(p_payload->>'title'),'')='' then raise exception 'Add a document title'; end if;
    if p_revision=0 then
      insert into public.agency_documents(id,tenant_id,kind,title,is_template,status,content,created_by)
      values(p_id,tenant,p_payload->>'kind',trim(p_payload->>'title'),coalesce((p_payload->>'is_template')::boolean,false),'draft',p_payload->'content',actor) returning * into doc;
      insert into public.agency_document_events(document_id,tenant_id,kind,actor_id,document_revision) values(doc.id,tenant,'created',actor,doc.revision);
    else
      perform 1 from public.agency_documents where id=p_id and tenant_id=tenant for update;
      if exists(select 1 from public.agency_document_events where document_id=p_id and tenant_id=tenant and kind='paid_manually') then raise exception 'This invoice has a recorded payment. Duplicate it to create a revised document.'; end if;
      update public.agency_documents set title=trim(p_payload->>'title'),content=p_payload->'content',status='draft',revision=revision+1,updated_at=now()
      where id=p_id and tenant_id=tenant and revision=p_revision and archived_at is null returning * into doc;
      if not found then raise exception 'This document changed. Reopen it before saving again.' using errcode='40001'; end if;
      insert into public.agency_document_events(document_id,tenant_id,kind,actor_id,document_revision) values(doc.id,tenant,'saved',actor,doc.revision);
    end if;
    return to_jsonb(doc);
  end if;
  select * into doc from public.agency_documents where id=p_id and tenant_id=tenant and archived_at is null for update;
  if not found then raise exception 'Document unavailable'; end if;
  if p_revision is distinct from doc.revision then raise exception 'This document changed. Reopen it before continuing.' using errcode='40001'; end if;
  if p_action='events' then return coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'created_at',created_at,'note',note,'document_revision',document_revision) order by created_at desc) from public.agency_document_events where document_id=doc.id),'[]'::jsonb); end if;
  if p_action='archive' then
    update public.agency_documents set archived_at=now(),revision=revision+1 where id=doc.id;
    update public.agency_document_shares set revoked_at=now() where document_id=doc.id and revoked_at is null;
    return jsonb_build_object('ok',true);
  end if;
  if p_action='revoke' then
    update public.agency_document_shares set revoked_at=now() where document_id=doc.id and revoked_at is null;
    insert into public.agency_document_events(document_id,tenant_id,kind,actor_id,document_revision) values(doc.id,tenant,'link_revoked',actor,doc.revision);
    return jsonb_build_object('ok',true);
  end if;
  if doc.is_template then raise exception 'Create a document from this template first'; end if;
  if p_action not in ('share','sent','paid') then raise exception 'Unsupported document action'; end if;
  if doc.content->>'reviewed' is distinct from 'true' or doc.content->'sections'='[]'::jsonb or (doc.content->'sections')::text like '%[[%' then raise exception 'Complete and review this document before sharing'; end if;
  required:=case doc.kind when 'player_contract' then array['player_name','start_date','end_date','commission'] when 'mandate' then array['principal_name','principal_type','player_name','territory','start_date','end_date','commission'] when 'agency_pitch' then array['player_name','purpose'] when 'invoice' then array['invoice_number','recipient_name','recipient_address','issue_date','due_date','currency'] else array['player_name','recipient_name','report_date','author'] end;
  foreach key in array required loop if coalesce(trim(doc.content->'fields'->>key),'')='' then raise exception 'Complete all required document fields'; end if; end loop;
  if coalesce(trim(doc.content->'brand'->>'name'),'')='' then raise exception 'Add the agency name'; end if;
  if doc.kind='invoice' then
    if jsonb_array_length(doc.content->'lines')=0 or exists(select 1 from jsonb_array_elements(doc.content->'lines') line where coalesce(trim(line->>'description'),'')='' or coalesce(line->>'quantity','')!~'^\d{1,9}(\.\d{1,3})?$' or coalesce(line->>'unitPrice','')!~'^\d{1,9}(\.\d{1,2})?$') then raise exception 'Check invoice line items'; end if;
    if doc.content->'fields'->>'currency' !~ '^[A-Z]{3}$' or coalesce(doc.content->'fields'->>'tax_rate','0')!~'^\d{1,3}(\.\d{1,2})?$' then raise exception 'Check invoice currency and tax'; end if;
    select sum(round((line->>'quantity')::numeric*(line->>'unitPrice')::numeric*100)) into invoice_subtotal from jsonb_array_elements(doc.content->'lines') line;
    if invoice_subtotal<=0 or invoice_subtotal+round(invoice_subtotal*coalesce(nullif(doc.content->'fields'->>'tax_rate',''),'0')::numeric/100)>999999999999 or coalesce(nullif(doc.content->'fields'->>'tax_rate',''),'0')::numeric>100
      or exists(select 1 from jsonb_array_elements(doc.content->'lines') line where (line->>'quantity')::numeric<=0) then raise exception 'Check invoice amounts and tax'; end if;
    if coalesce(trim(doc.content->'brand'->>'bankDetails'),'')='' and coalesce(doc.content->'fields'->>'payment_url','')!~'^https://' then raise exception 'Add bank details or a secure payment link'; end if;
    if coalesce(doc.content->'fields'->>'payment_url','')<>'' and doc.content->'fields'->>'payment_url'!~'^https://[^/@[:space:]]+([/?#]|$)' then raise exception 'Use a secure payment link without credentials'; end if;
  end if;
  for var in select m[1] from regexp_matches((doc.content->'sections')::text,'\{\{([a-z_]+)\}\}','g') m loop
    if var not in ('agency_name','agency_legal_name','agency_email','agency_phone') and coalesce(trim(doc.content->'fields'->>var),'')='' then raise exception 'Complete the document variables before sharing'; end if;
    if (var='agency_email' and coalesce(trim(doc.content->'brand'->>'email'),'')='') or (var='agency_phone' and coalesce(trim(doc.content->'brand'->>'phone'),'')='') then raise exception 'Complete your agency contact details or remove the unused variable'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(doc.content->'sources') source where coalesce(trim(source->>'label'),'')='' or (coalesce(source->>'url','')<>'' and source->>'url'!~'^https://[^/@[:space:]]+([/?#]|$)')) then raise exception 'Check the document sources and links'; end if;
  if p_action in ('sent','paid') then
    if doc.kind<>'invoice' then raise exception 'This action is for invoices'; end if;
    if coalesce(trim(p_payload->>'note'),'')='' then raise exception 'Add a reference or note for this record'; end if;
    if p_action='paid' and exists(select 1 from public.agency_document_events where document_id=doc.id and kind='paid_manually') then raise exception 'A payment has already been recorded for this invoice'; end if;
    insert into public.agency_document_events(document_id,tenant_id,kind,actor_id,note,document_revision) values(doc.id,tenant,case when p_action='paid' then 'paid_manually' else 'sent_manually' end,actor,left(p_payload->>'note',500),doc.revision);
    return jsonb_build_object('ok',true);
  end if;
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.agency_document_shares(document_id,tenant_id,token_hash,snapshot,created_by,document_revision)
  values(doc.id,tenant,encode(sha256(convert_to(token,'UTF8')),'hex'),private.document_studio_snapshot(doc),actor,doc.revision) returning id into share_id;
  update public.agency_documents set status='ready' where id=doc.id;
  insert into public.agency_document_events(document_id,tenant_id,share_id,kind,actor_id,document_revision) values(doc.id,tenant,share_id,'link_created',actor,doc.revision);
  return jsonb_build_object('token',token,'expires_at',now()+interval '14 days');
exception when unique_violation then raise exception 'This document ID or invoice number is already in use. Reopen the library and use a unique invoice number.';
end $$;
revoke all on function public.redream_documents(text,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.redream_documents(text,text,uuid,integer,jsonb) to authenticated,service_role;

-- Anonymous access is intentionally limited to a long random bearer token.
-- It has no list/search capability and returns an immutable, reviewed snapshot.
create function public.redream_document_open(p_workspace_slug text,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.agency_document_shares;
begin
  if p_token is null or p_token!~'^[0-9a-f]{64}$' then return null; end if;
  select s.* into link from public.agency_document_shares s join platform.tenants t on t.id=s.tenant_id
    join public.agency_documents d on d.id=s.document_id and d.tenant_id=s.tenant_id
    where t.slug=p_workspace_slug and t.status='active' and s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and s.revoked_at is null and s.expires_at>now() and d.archived_at is null;
  if not found then return null; end if;
  insert into public.agency_document_events(document_id,tenant_id,share_id,kind,document_revision) values(link.document_id,link.tenant_id,link.id,'opened',link.document_revision) on conflict do nothing;
  return link.snapshot;
end $$;
revoke all on function public.redream_document_open(text,text) from public;
grant execute on function public.redream_document_open(text,text) to anon,authenticated,service_role;

commit;
