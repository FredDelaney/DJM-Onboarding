create table platform.permission_catalog (
  permission_key text primary key,
  area text not null,
  description text not null,
  sensitive boolean not null default false,
  created_at timestamptz not null default now()
);
alter table platform.permission_catalog enable row level security;
revoke all on platform.permission_catalog from public, anon, authenticated;

create table platform.role_permissions (
  role text not null check (role in ('owner','admin','agent','scout','operations','player')),
  permission_key text not null references platform.permission_catalog(permission_key) on delete cascade,
  allowed boolean not null default true,
  primary key (role, permission_key)
);
alter table platform.role_permissions enable row level security;
revoke all on platform.role_permissions from public, anon, authenticated;

create table platform.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('platform_admin','support','security','billing')),
  status text not null default 'active' check (status in ('active','suspended','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table platform.platform_admins enable row level security;
revoke all on platform.platform_admins from public, anon, authenticated;
create trigger platform_admins_touch_updated_at before update on platform.platform_admins for each row execute function platform.touch_updated_at();

insert into platform.permission_catalog(permission_key,area,description,sensitive) values
('tenant.settings.manage','tenant','Manage tenant settings and configuration',true),
('tenant.branding.manage','tenant','Manage tenant branding and domains',true),
('tenant.team.manage','tenant','Invite, suspend and manage tenant members',true),
('players.read','players','Read managed player records',false),
('players.write','players','Create and edit managed player records',false),
('players.sensitive.read','players','Read sensitive player information',true),
('players.sensitive.write','players','Edit sensitive player information',true),
('network.read','network','Read agency contacts and relationships',false),
('network.write','network','Create and edit agency contacts and relationships',false),
('opportunities.read','opportunities','Read opportunities and club needs',false),
('opportunities.write','opportunities','Create and edit opportunities and club needs',false),
('scouting.read','scouting','Read scouting records',false),
('scouting.write','scouting','Create and edit scouting records',false),
('documents.read','documents','Read permitted documents',true),
('documents.write','documents','Upload and manage permitted documents',true),
('finance.read','finance','Read financial and commission information',true),
('finance.write','finance','Edit financial and commission information',true),
('intelligence.use','intelligence','Use deterministic football intelligence',false),
('ai.use','ai','Use AI-assisted capabilities when entitled',false),
('speech.use','speech','Use speech capture when entitled',false),
('audit.read','audit','Read tenant audit history',true),
('exports.create','exports','Create tenant data exports',true),
('player_portal.self','player','Access the signed-in player own portal data',false)
on conflict (permission_key) do nothing;

insert into platform.role_permissions(role,permission_key,allowed)
select 'owner', permission_key, true from platform.permission_catalog;
insert into platform.role_permissions(role,permission_key,allowed)
select 'admin', permission_key, true from platform.permission_catalog where permission_key <> 'tenant.settings.manage';
insert into platform.role_permissions(role,permission_key,allowed) values
('admin','tenant.settings.manage',true),
('agent','players.read',true),('agent','players.write',true),('agent','players.sensitive.read',true),('agent','network.read',true),('agent','network.write',true),('agent','opportunities.read',true),('agent','opportunities.write',true),('agent','scouting.read',true),('agent','documents.read',true),('agent','documents.write',true),('agent','intelligence.use',true),('agent','ai.use',true),('agent','speech.use',true),('agent','exports.create',true),
('scout','players.read',true),('scout','network.read',true),('scout','opportunities.read',true),('scout','scouting.read',true),('scout','scouting.write',true),('scout','intelligence.use',true),
('operations','players.read',true),('operations','players.write',true),('operations','players.sensitive.read',true),('operations','players.sensitive.write',true),('operations','network.read',true),('operations','network.write',true),('operations','opportunities.read',true),('operations','opportunities.write',true),('operations','documents.read',true),('operations','documents.write',true),('operations','finance.read',true),('operations','finance.write',true),('operations','exports.create',true),
('player','player_portal.self',true)
on conflict (role,permission_key) do update set allowed=excluded.allowed;

create or replace function platform.role_has_permission(p_role text, p_permission_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select rp.allowed from platform.role_permissions rp where rp.role=p_role and rp.permission_key=p_permission_key),false);
$$;

create or replace function platform.member_has_permission(p_user_id uuid, p_tenant_id uuid, p_permission_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from platform.tenant_memberships m
    join platform.role_permissions rp on rp.role=m.role and rp.permission_key=p_permission_key and rp.allowed
    where m.user_id=p_user_id and m.tenant_id=p_tenant_id and m.status='active'
  );
$$;

revoke all on function platform.role_has_permission(text,text) from public, anon, authenticated;
revoke all on function platform.member_has_permission(uuid,uuid,text) from public, anon, authenticated;
