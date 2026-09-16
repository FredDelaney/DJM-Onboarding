-- Phase 1 of operational tenant isolation.
--
-- Existing DJM operational data predates the SaaS tenant model.
-- Add explicit ownership without changing RLS behaviour yet.
--
-- No DEFAULT is intentionally set on tenant_id.
-- New writes must receive their tenant from trusted server-side resolution.

do $migration$
declare
  v_djm_tenant_id uuid;
  r record;
  v_constraint_name text;
  v_index_name text;
begin
  select id
    into v_djm_tenant_id
  from platform.tenants
  where slug = 'djm-sports-management'
    and status = 'active'
  limit 1;

  if v_djm_tenant_id is null then
    raise exception
      'Active DJM tenant not found; refusing operational tenant backfill';
  end if;

  for r in
    select *
    from (
      values
        ('public', 'players'),
        ('public', 'player_opportunities'),
        ('djm_os', 'people'),
        ('djm_os', 'organisations'),
        ('djm_os', 'contact_methods'),
        ('djm_os', 'relationships'),
        ('djm_os', 'interactions'),
        ('djm_os', 'club_needs'),
        ('djm_os', 'player_matches'),
        ('djm_os', 'tasks'),
        ('djm_os', 'meetings'),
        ('djm_os', 'captures')
    ) as targets(schema_name, table_name)
  loop
    execute format(
      'alter table %I.%I add column if not exists tenant_id uuid',
      r.schema_name,
      r.table_name
    );

    execute format(
      'update %I.%I set tenant_id = $1 where tenant_id is null',
      r.schema_name,
      r.table_name
    )
    using v_djm_tenant_id;

    v_constraint_name :=
      r.table_name || '_tenant_id_fkey';

    if not exists (
      select 1
      from pg_constraint c
      join pg_class tbl
        on tbl.oid = c.conrelid
      join pg_namespace ns
        on ns.oid = tbl.relnamespace
      where ns.nspname = r.schema_name
        and tbl.relname = r.table_name
        and c.conname = v_constraint_name
    ) then
      execute format(
        'alter table %I.%I
         add constraint %I
         foreign key (tenant_id)
         references platform.tenants(id)',
        r.schema_name,
        r.table_name,
        v_constraint_name
      );
    end if;

    v_index_name :=
      'idx_' || r.table_name || '_tenant_id';

    execute format(
      'create index if not exists %I
       on %I.%I (tenant_id)',
      v_index_name,
      r.schema_name,
      r.table_name
    );

    execute format(
      'comment on column %I.%I.tenant_id is %L',
      r.schema_name,
      r.table_name,
      'Owning SaaS tenant. Must be supplied from trusted server-side tenant resolution.'
    );
  end loop;
end
$migration$;
