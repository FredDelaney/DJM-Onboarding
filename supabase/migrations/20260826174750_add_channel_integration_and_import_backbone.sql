create table if not exists djm_os.channel_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references djm_os.team_members(user_id) on delete cascade,
  channel text not null,
  provider text,
  external_account_id text,
  display_label text,
  status text not null default 'planned',
  capabilities text[] not null default '{}'::text[],
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,channel,provider,external_account_id)
);
create index if not exists channel_connections_user_idx on djm_os.channel_connections(user_id,channel,status);

create table if not exists djm_os.import_batches (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references djm_os.team_members(user_id) on delete cascade,
  source_type text not null,
  source_name text,
  status text not null default 'queued',
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  created_people integer not null default 0,
  updated_people integer not null default 0,
  created_orgs integer not null default 0,
  duplicate_rows integer not null default 0,
  error_rows integer not null default 0,
  source_uri text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists djm_os.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references djm_os.import_batches(id) on delete cascade,
  row_number integer not null,
  raw_json jsonb not null,
  status text not null default 'queued',
  person_id uuid references djm_os.people(id) on delete set null,
  organisation_id uuid references djm_os.organisations(id) on delete set null,
  match_confidence numeric(5,4),
  error_message text,
  processed_at timestamptz,
  unique(batch_id,row_number)
);
create index if not exists import_rows_batch_idx on djm_os.import_rows(batch_id,status,row_number);

create table if not exists djm_os.external_identity_links (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  provider text not null,
  external_id text not null,
  external_url text,
  confidence numeric(5,4) not null default 1,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,external_id)
);
create index if not exists external_identity_entity_idx on djm_os.external_identity_links(entity_type,entity_id);

alter table djm_os.channel_connections enable row level security;
alter table djm_os.import_batches enable row level security;
alter table djm_os.import_rows enable row level security;
alter table djm_os.external_identity_links enable row level security;
grant select,insert,update,delete on djm_os.channel_connections,djm_os.import_batches,djm_os.import_rows,djm_os.external_identity_links to authenticated;

drop policy if exists djm_team_select on djm_os.channel_connections;
drop policy if exists djm_team_insert on djm_os.channel_connections;
drop policy if exists djm_team_update on djm_os.channel_connections;
drop policy if exists djm_team_delete on djm_os.channel_connections;
create policy djm_team_select on djm_os.channel_connections for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.channel_connections for insert to authenticated with check ((select djm_os.is_team_member()) and user_id=auth.uid());
create policy djm_team_update on djm_os.channel_connections for update to authenticated using ((select djm_os.is_team_member()) and user_id=auth.uid()) with check ((select djm_os.is_team_member()) and user_id=auth.uid());
create policy djm_team_delete on djm_os.channel_connections for delete to authenticated using ((select djm_os.is_team_member()) and user_id=auth.uid());

do $$ declare t text; begin foreach t in array array['import_batches','import_rows','external_identity_links'] loop execute format('drop policy if exists djm_team_select on djm_os.%I',t); execute format('drop policy if exists djm_team_insert on djm_os.%I',t); execute format('drop policy if exists djm_team_update on djm_os.%I',t); execute format('drop policy if exists djm_team_delete on djm_os.%I',t); execute format('create policy djm_team_select on djm_os.%I for select to authenticated using ((select djm_os.is_team_member()))',t); execute format('create policy djm_team_insert on djm_os.%I for insert to authenticated with check ((select djm_os.is_team_member()))',t); execute format('create policy djm_team_update on djm_os.%I for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()))',t); execute format('create policy djm_team_delete on djm_os.%I for delete to authenticated using ((select djm_os.is_team_member()))',t); end loop; end $$;

create or replace function public.djm_channel_connections()
returns table(id uuid,channel text,provider text,display_label text,status text,capabilities text[],last_synced_at timestamptz,last_error text,created_at timestamptz)
language sql stable security invoker set search_path=''
as $$ select c.id,c.channel,c.provider,c.display_label,c.status,c.capabilities,c.last_synced_at,c.last_error,c.created_at from djm_os.channel_connections c where c.user_id=auth.uid() order by c.channel,c.provider; $$;

create or replace function public.djm_register_channel_connection(p_channel text,p_provider text,p_external_account_id text default null,p_display_label text default null,p_capabilities text[] default '{}'::text[])
returns jsonb language plpgsql security invoker set search_path=''
as $$ declare v_id uuid; begin if trim(coalesce(p_channel,''))='' then raise exception 'Channel required'; end if; insert into djm_os.channel_connections(user_id,channel,provider,external_account_id,display_label,status,capabilities) values(auth.uid(),lower(trim(p_channel)),nullif(lower(trim(coalesce(p_provider,''))),''),nullif(trim(coalesce(p_external_account_id,'')),''),nullif(trim(coalesce(p_display_label,'')),''),'configured',coalesce(p_capabilities,'{}'::text[])) on conflict(user_id,channel,provider,external_account_id) do update set display_label=coalesce(excluded.display_label,djm_os.channel_connections.display_label),capabilities=excluded.capabilities,status='configured',updated_at=now() returning id into v_id; return jsonb_build_object('id',v_id,'status','configured'); end; $$;

create or replace function public.djm_create_import_batch(p_source_type text,p_source_name text default null,p_source_uri text default null)
returns uuid language plpgsql security invoker set search_path=''
as $$ declare v_id uuid; begin insert into djm_os.import_batches(submitted_by,source_type,source_name,source_uri) values(auth.uid(),lower(trim(p_source_type)),nullif(trim(coalesce(p_source_name,'')),''),nullif(trim(coalesce(p_source_uri,'')),'')) returning id into v_id; return v_id; end; $$;

create or replace function public.djm_import_add_row(p_batch_id uuid,p_row_number integer,p_raw jsonb)
returns uuid language plpgsql security invoker set search_path=''
as $$ declare v_id uuid; begin if not exists(select 1 from djm_os.import_batches b where b.id=p_batch_id and b.submitted_by=auth.uid()) then raise exception 'Import batch not found'; end if; insert into djm_os.import_rows(batch_id,row_number,raw_json) values(p_batch_id,p_row_number,p_raw) on conflict(batch_id,row_number) do update set raw_json=excluded.raw_json,status='queued',error_message=null,processed_at=null returning id into v_id; update djm_os.import_batches set total_rows=(select count(*) from djm_os.import_rows where batch_id=p_batch_id) where id=p_batch_id; return v_id; end; $$;

revoke execute on function public.djm_channel_connections() from public,anon;
revoke execute on function public.djm_register_channel_connection(text,text,text,text,text[]) from public,anon;
revoke execute on function public.djm_create_import_batch(text,text,text) from public,anon;
revoke execute on function public.djm_import_add_row(uuid,integer,jsonb) from public,anon;
grant execute on function public.djm_channel_connections(),public.djm_register_channel_connection(text,text,text,text,text[]),public.djm_create_import_batch(text,text,text),public.djm_import_add_row(uuid,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
