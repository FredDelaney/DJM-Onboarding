-- Production compatibility for the ReDream activation-evidence migration.
-- Adds only the optional structures that the shared activation read model reads.
-- No customer data is seeded and no optional workflow is enabled.

alter table platform.tenant_owner_invites
  add column if not exists first_opened_at timestamptz,
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count integer not null default 0,
  add column if not exists first_sent_at timestamptz,
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0;

alter table platform.tenant_owner_invites
  drop constraint if exists tenant_owner_invites_open_count_check,
  add constraint tenant_owner_invites_open_count_check check (open_count >= 0),
  drop constraint if exists tenant_owner_invites_send_count_check,
  add constraint tenant_owner_invites_send_count_check check (send_count >= 0);

create table if not exists platform.tenant_operating_windows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  window_type text not null default 'transfer' check (window_type in ('transfer','renewal','recruitment','preseason','custom')),
  status text not null default 'planned' check (status in ('planned','active','closed','archived')),
  start_date date not null,
  end_date date not null,
  markets jsonb not null default '[]'::jsonb,
  objectives jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists tenant_operating_windows_tenant_dates_idx
  on platform.tenant_operating_windows(tenant_id,start_date,end_date);

create index if not exists tenant_operating_windows_tenant_status_idx
  on platform.tenant_operating_windows(tenant_id,status);

alter table platform.tenant_operating_windows enable row level security;
revoke all on platform.tenant_operating_windows from public,anon,authenticated;
grant all on platform.tenant_operating_windows to service_role;

create table if not exists platform.player_value_proof_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  snapshot_date date not null default current_date,
  window_days integer not null check (window_days between 1 and 366),
  window_start timestamptz not null,
  window_end timestamptz not null,
  proof jsonb not null,
  captured_by uuid null,
  source text not null default 'manual_capture',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, player_id, snapshot_date, window_days)
);

create index if not exists player_value_proof_snapshots_tenant_date_idx
  on platform.player_value_proof_snapshots(tenant_id,snapshot_date desc);

create index if not exists player_value_proof_snapshots_player_date_idx
  on platform.player_value_proof_snapshots(tenant_id,player_id,snapshot_date desc);

alter table platform.player_value_proof_snapshots enable row level security;
revoke all on platform.player_value_proof_snapshots from public,anon,authenticated;
grant all on platform.player_value_proof_snapshots to service_role;

create table if not exists platform.tenant_migration_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  entity_type text not null check (entity_type in ('players','people','organisations','club_needs')),
  source_label text not null,
  status text not null default 'draft' check (status in ('draft','preflight_ready','approved','applying','applied','cancelled')),
  field_mapping jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  valid_rows integer not null default 0,
  warning_rows integer not null default 0,
  blocked_rows integer not null default 0,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenant_migration_batches_tenant_status_idx
  on platform.tenant_migration_batches(tenant_id,status,created_at desc);

alter table platform.tenant_migration_batches enable row level security;
revoke all on platform.tenant_migration_batches from public,anon,authenticated;
grant all on platform.tenant_migration_batches to service_role;

create or replace function public.platform_server_player_activation_command(
  p_tenant_id uuid,
  p_limit integer default 500
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'available',false,
    'tenant_id',p_tenant_id,
    'generated_at',now(),
    'reason','player_activation_module_not_promoted',
    'summary',jsonb_build_object(
      'eligible_players',0,
      'invite_not_created',0,
      'invite_pending',0,
      'invite_expired',0,
      'account_linked_never_opened',0,
      'players_with_recorded_portal_activity',0,
      'player_value_loop_active',0
    ),
    'items','[]'::jsonb,
    'truth_contract',jsonb_build_object(
      'scope','The optional player activation module is not promoted in this production foundation. No usage or activation is inferred.'
    )
  );
$$;

revoke all on function public.platform_server_player_activation_command(uuid,integer)
from public,anon,authenticated;

grant execute on function public.platform_server_player_activation_command(uuid,integer)
to service_role;
