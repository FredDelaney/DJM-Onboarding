create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.platform_plan_catalog (
  plan_key text primary key,
  display_name text not null,
  currency text not null default 'EUR',
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  price_is_from boolean not null default false,
  active_player_limit integer check (active_player_limit is null or active_player_limit > 0),
  staff_limit integer check (staff_limit is null or staff_limit > 0),
  entitlements jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_plan_key_format check (plan_key ~ '^[a-z][a-z0-9_]*$')
);

insert into public.platform_plan_catalog (
  plan_key,
  display_name,
  monthly_price_cents,
  price_is_from,
  active_player_limit,
  staff_limit,
  entitlements
)
values
  ('agency','Agency',14900,false,40,5,'{"custom_domain":false,"intelligence":false,"ai":false,"speech":false,"revenue_analytics":false,"full_white_label":false,"sso":false,"custom_integrations":false,"dedicated_infrastructure":false}'::jsonb),
  ('pro','Pro',39900,false,100,null,'{"custom_domain":true,"intelligence":true,"ai":true,"speech":true,"revenue_analytics":false,"full_white_label":false,"sso":false,"custom_integrations":false,"dedicated_infrastructure":false}'::jsonb),
  ('elite','Elite',79900,false,250,null,'{"custom_domain":true,"intelligence":true,"ai":true,"speech":true,"revenue_analytics":true,"full_white_label":true,"sso":false,"custom_integrations":false,"dedicated_infrastructure":false}'::jsonb),
  ('enterprise','Enterprise',150000,true,null,null,'{"custom_domain":true,"intelligence":true,"ai":true,"speech":true,"revenue_analytics":true,"full_white_label":true,"sso":true,"custom_integrations":true,"dedicated_infrastructure":true}'::jsonb)
on conflict (plan_key) do update set
  display_name = excluded.display_name,
  currency = excluded.currency,
  monthly_price_cents = excluded.monthly_price_cents,
  price_is_from = excluded.price_is_from,
  active_player_limit = excluded.active_player_limit,
  staff_limit = excluded.staff_limit,
  entitlements = excluded.entitlements,
  is_active = true,
  updated_at = now();

create table if not exists public.platform_agencies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  legal_name text,
  plan_key text not null references public.platform_plan_catalog(plan_key),
  status text not null default 'active' check (status in ('trial','active','suspended','archived')),
  billing_exempt boolean not null default false,
  timezone text not null default 'UTC',
  locale text not null default 'en-GB',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_agency_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table if not exists public.platform_agency_branding (
  agency_id uuid primary key references public.platform_agencies(id) on delete cascade,
  organisation_name text not null,
  product_name text not null,
  logo_url text,
  logo_mark_url text,
  favicon_url text,
  primary_colour text check (primary_colour is null or primary_colour ~ '^#[0-9A-Fa-f]{6}$'),
  accent_colour text check (accent_colour is null or accent_colour ~ '^#[0-9A-Fa-f]{6}$'),
  login_background_url text,
  support_email text,
  website_url text,
  powered_by_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_agency_domains (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.platform_agencies(id) on delete cascade,
  hostname text not null unique,
  is_primary boolean not null default false,
  status text not null default 'pending' check (status in ('pending','verified','active','failed','disabled')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_agency_hostname_format check (hostname = lower(hostname) and hostname !~ '[/:]' and hostname ~ '^[a-z0-9.-]+$')
);

create unique index if not exists platform_agency_one_primary_domain_idx
  on public.platform_agency_domains(agency_id)
  where is_primary and status <> 'disabled';
create index if not exists platform_agency_domains_agency_idx
  on public.platform_agency_domains(agency_id, status);

create table if not exists public.platform_agency_memberships (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.platform_agencies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role text not null default 'staff' check (role in ('owner','admin','staff','agent','scout','operations','analyst')),
  status text not null default 'active' check (status in ('invited','active','suspended','revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_membership_identity_present check (user_id is not null or invited_email is not null)
);

create unique index if not exists platform_agency_membership_user_unique_idx
  on public.platform_agency_memberships(agency_id, user_id) where user_id is not null;
create unique index if not exists platform_agency_membership_invite_unique_idx
  on public.platform_agency_memberships(agency_id, lower(invited_email)) where invited_email is not null and status = 'invited';
create index if not exists platform_agency_membership_user_idx
  on public.platform_agency_memberships(user_id, status) where user_id is not null;

create table if not exists public.platform_agency_feature_overrides (
  agency_id uuid not null references public.platform_agencies(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null,
  reason text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (agency_id, feature_key),
  constraint platform_feature_key_format check (feature_key ~ '^[a-z][a-z0-9_]*$')
);

create table if not exists public.platform_agency_subscriptions (
  agency_id uuid primary key references public.platform_agencies(id) on delete cascade,
  provider text,
  customer_ref text,
  subscription_ref text,
  status text not null default 'inactive' check (status in ('inactive','trialing','active','past_due','paused','cancelled','incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_agency_infrastructure (
  agency_id uuid primary key references public.platform_agencies(id) on delete cascade,
  deployment_mode text not null default 'shared' check (deployment_mode in ('shared','dedicated')),
  region text,
  project_ref text,
  provisioning_status text not null default 'ready' check (provisioning_status in ('pending','provisioning','ready','error','disabled')),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  provisioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.platform_set_updated_at()
returns trigger language plpgsql set search_path = '' as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function private.platform_is_agency_member(p_agency_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.platform_agency_memberships m
    where m.agency_id = p_agency_id and m.user_id = auth.uid() and m.status = 'active'
  );
$function$;

create or replace function private.platform_has_agency_role(p_agency_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.platform_agency_memberships m
    where m.agency_id = p_agency_id and m.user_id = auth.uid() and m.status = 'active' and m.role = any(p_roles)
  );
$function$;

create or replace function private.platform_protect_last_owner()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  owner_is_being_removed boolean := false;
begin
  if old.role = 'owner' and old.status = 'active' then
    if tg_op = 'DELETE' then
      owner_is_being_removed := true;
    elsif new.role is distinct from 'owner'
       or new.status is distinct from 'active'
       or new.agency_id is distinct from old.agency_id
       or new.user_id is distinct from old.user_id then
      owner_is_being_removed := true;
    end if;
  end if;

  if owner_is_being_removed and not exists (
    select 1 from public.platform_agency_memberships m
    where m.agency_id = old.agency_id and m.id <> old.id and m.role = 'owner' and m.status = 'active' and m.user_id is not null
  ) then
    raise exception 'An agency must keep at least one active owner';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function public.platform_feature_enabled(p_agency_id uuid, p_feature_key text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select case
    when not private.platform_is_agency_member(p_agency_id) then false
    else coalesce(
      (select o.enabled from public.platform_agency_feature_overrides o where o.agency_id = p_agency_id and o.feature_key = p_feature_key),
      (select coalesce((p.entitlements ->> p_feature_key)::boolean, false)
       from public.platform_agencies a join public.platform_plan_catalog p on p.plan_key = a.plan_key
       where a.id = p_agency_id and a.status in ('trial','active') and p.is_active),
      false
    )
  end;
$function$;

create or replace function public.platform_my_agencies()
returns table (agency_id uuid, slug text, display_name text, plan_key text, membership_role text, agency_status text)
language sql stable security definer set search_path = '' as $function$
  select a.id, a.slug, a.display_name, a.plan_key, m.role, a.status
  from public.platform_agency_memberships m
  join public.platform_agencies a on a.id = m.agency_id
  where m.user_id = auth.uid() and m.status = 'active' and a.status in ('trial','active')
  order by a.display_name;
$function$;

create or replace function public.platform_brand_for_hostname(p_hostname text)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select jsonb_build_object(
    'agency_id', a.id,
    'agency_slug', a.slug,
    'organisation_name', b.organisation_name,
    'product_name', b.product_name,
    'logo_url', b.logo_url,
    'logo_mark_url', b.logo_mark_url,
    'favicon_url', b.favicon_url,
    'primary_colour', b.primary_colour,
    'accent_colour', b.accent_colour,
    'login_background_url', b.login_background_url,
    'support_email', b.support_email,
    'website_url', b.website_url,
    'powered_by_label', b.powered_by_label
  )
  from public.platform_agency_domains d
  join public.platform_agencies a on a.id = d.agency_id
  join public.platform_agency_branding b on b.agency_id = a.id
  where d.hostname = lower(split_part(trim(p_hostname), ':', 1))
    and d.status = 'active' and a.status in ('trial','active')
  limit 1;
$function$;

revoke all on function private.platform_is_agency_member(uuid) from public, anon;
revoke all on function private.platform_has_agency_role(uuid, text[]) from public, anon;
grant execute on function private.platform_is_agency_member(uuid) to authenticated;
grant execute on function private.platform_has_agency_role(uuid, text[]) to authenticated;
revoke all on function public.platform_feature_enabled(uuid, text) from public, anon;
grant execute on function public.platform_feature_enabled(uuid, text) to authenticated;
revoke all on function public.platform_my_agencies() from public, anon;
grant execute on function public.platform_my_agencies() to authenticated;
revoke all on function public.platform_brand_for_hostname(text) from public;
grant execute on function public.platform_brand_for_hostname(text) to anon, authenticated;

alter table public.platform_plan_catalog enable row level security;
alter table public.platform_agencies enable row level security;
alter table public.platform_agency_branding enable row level security;
alter table public.platform_agency_domains enable row level security;
alter table public.platform_agency_memberships enable row level security;
alter table public.platform_agency_feature_overrides enable row level security;
alter table public.platform_agency_subscriptions enable row level security;
alter table public.platform_agency_infrastructure enable row level security;

drop policy if exists platform_plan_catalog_read on public.platform_plan_catalog;
create policy platform_plan_catalog_read on public.platform_plan_catalog for select to authenticated using (is_active);
drop policy if exists platform_agencies_read on public.platform_agencies;
create policy platform_agencies_read on public.platform_agencies for select to authenticated using (private.platform_is_agency_member(id));
drop policy if exists platform_agencies_manage on public.platform_agencies;
create policy platform_agencies_manage on public.platform_agencies for update to authenticated
using (private.platform_has_agency_role(id, array['owner','admin']))
with check (private.platform_has_agency_role(id, array['owner','admin']));
drop policy if exists platform_branding_read on public.platform_agency_branding;
create policy platform_branding_read on public.platform_agency_branding for select to authenticated using (private.platform_is_agency_member(agency_id));
drop policy if exists platform_branding_manage on public.platform_agency_branding;
create policy platform_branding_manage on public.platform_agency_branding for update to authenticated
using (private.platform_has_agency_role(agency_id, array['owner','admin']))
with check (private.platform_has_agency_role(agency_id, array['owner','admin']));
drop policy if exists platform_domains_read on public.platform_agency_domains;
create policy platform_domains_read on public.platform_agency_domains for select to authenticated using (private.platform_is_agency_member(agency_id));
drop policy if exists platform_domains_insert on public.platform_agency_domains;
create policy platform_domains_insert on public.platform_agency_domains for insert to authenticated
with check (status = 'pending' and verified_at is null and private.platform_has_agency_role(agency_id, array['owner','admin']));
drop policy if exists platform_domains_update on public.platform_agency_domains;
create policy platform_domains_update on public.platform_agency_domains for update to authenticated
using (private.platform_has_agency_role(agency_id, array['owner','admin']))
with check (private.platform_has_agency_role(agency_id, array['owner','admin']));
drop policy if exists platform_domains_delete on public.platform_agency_domains;
create policy platform_domains_delete on public.platform_agency_domains for delete to authenticated using (private.platform_has_agency_role(agency_id, array['owner','admin']));
drop policy if exists platform_memberships_read on public.platform_agency_memberships;
create policy platform_memberships_read on public.platform_agency_memberships for select to authenticated
using (user_id = auth.uid() or private.platform_has_agency_role(agency_id, array['owner','admin']));
drop policy if exists platform_memberships_owner_insert on public.platform_agency_memberships;
create policy platform_memberships_owner_insert on public.platform_agency_memberships for insert to authenticated
with check (private.platform_has_agency_role(agency_id, array['owner']));
drop policy if exists platform_memberships_admin_insert on public.platform_agency_memberships;
create policy platform_memberships_admin_insert on public.platform_agency_memberships for insert to authenticated
with check (role <> 'owner' and private.platform_has_agency_role(agency_id, array['admin']));
drop policy if exists platform_memberships_owner_update on public.platform_agency_memberships;
create policy platform_memberships_owner_update on public.platform_agency_memberships for update to authenticated
using (private.platform_has_agency_role(agency_id, array['owner']))
with check (private.platform_has_agency_role(agency_id, array['owner']));
drop policy if exists platform_memberships_admin_update on public.platform_agency_memberships;
create policy platform_memberships_admin_update on public.platform_agency_memberships for update to authenticated
using (role <> 'owner' and private.platform_has_agency_role(agency_id, array['admin']))
with check (role <> 'owner' and private.platform_has_agency_role(agency_id, array['admin']));
drop policy if exists platform_memberships_owner_delete on public.platform_agency_memberships;
create policy platform_memberships_owner_delete on public.platform_agency_memberships for delete to authenticated using (private.platform_has_agency_role(agency_id, array['owner']));
drop policy if exists platform_memberships_admin_delete on public.platform_agency_memberships;
create policy platform_memberships_admin_delete on public.platform_agency_memberships for delete to authenticated
using (role <> 'owner' and private.platform_has_agency_role(agency_id, array['admin']));
drop policy if exists platform_feature_overrides_read on public.platform_agency_feature_overrides;
create policy platform_feature_overrides_read on public.platform_agency_feature_overrides for select to authenticated using (private.platform_is_agency_member(agency_id));
drop policy if exists platform_subscriptions_read on public.platform_agency_subscriptions;
create policy platform_subscriptions_read on public.platform_agency_subscriptions for select to authenticated using (private.platform_has_agency_role(agency_id, array['owner','admin']));

revoke all on public.platform_plan_catalog from anon, authenticated;
revoke all on public.platform_agencies from anon, authenticated;
revoke all on public.platform_agency_branding from anon, authenticated;
revoke all on public.platform_agency_domains from anon, authenticated;
revoke all on public.platform_agency_memberships from anon, authenticated;
revoke all on public.platform_agency_feature_overrides from anon, authenticated;
revoke all on public.platform_agency_subscriptions from anon, authenticated;
revoke all on public.platform_agency_infrastructure from anon, authenticated;
grant select on public.platform_plan_catalog to authenticated;
grant select on public.platform_agencies to authenticated;
grant update (display_name, legal_name, timezone, locale, settings) on public.platform_agencies to authenticated;
grant select, update on public.platform_agency_branding to authenticated;
grant select, insert, delete on public.platform_agency_domains to authenticated;
grant update (is_primary) on public.platform_agency_domains to authenticated;
grant select on public.platform_agency_memberships to authenticated;
grant select on public.platform_agency_feature_overrides to authenticated;
grant select on public.platform_agency_subscriptions to authenticated;

drop trigger if exists platform_plan_catalog_updated_at on public.platform_plan_catalog;
create trigger platform_plan_catalog_updated_at before update on public.platform_plan_catalog for each row execute function private.platform_set_updated_at();
drop trigger if exists platform_agencies_updated_at on public.platform_agencies;
create trigger platform_agencies_updated_at before update on public.platform_agencies for each row execute function private.platform_set_updated_at();
drop trigger if exists platform_branding_updated_at on public.platform_agency_branding;
create trigger platform_branding_updated_at before update on public.platform_agency_branding for each row execute function private.platform_set_updated_at();
drop trigger if exists platform_domains_updated_at on public.platform_agency_domains;
create trigger platform_domains_updated_at before update on public.platform_agency_domains for each row execute function private.platform_set_updated_at();
drop trigger if exists platform_memberships_updated_at on public.platform_agency_memberships;
create trigger platform_memberships_updated_at before update on public.platform_agency_memberships for each row execute function private.platform_set_updated_at();
drop trigger if exists platform_memberships_protect_last_owner on public.platform_agency_memberships;
create trigger platform_memberships_protect_last_owner before update or delete on public.platform_agency_memberships for each row execute function private.platform_protect_last_owner();
drop trigger if exists platform_feature_overrides_updated_at on public.platform_agency_feature_overrides;
create trigger platform_feature_overrides_updated_at before update on public.platform_agency_feature_overrides for each row execute function private.platform_set_updated_at();
drop trigger if exists platform_subscriptions_updated_at on public.platform_agency_subscriptions;
create trigger platform_subscriptions_updated_at before update on public.platform_agency_subscriptions for each row execute function private.platform_set_updated_at();
drop trigger if exists platform_infrastructure_updated_at on public.platform_agency_infrastructure;
create trigger platform_infrastructure_updated_at before update on public.platform_agency_infrastructure for each row execute function private.platform_set_updated_at();

insert into public.platform_agencies (slug,display_name,legal_name,plan_key,status,billing_exempt,timezone,locale,settings)
values ('djm','DJM Sports Management','DJM Sports Management','enterprise','active',true,'Europe/Rome','en-GB','{"internal_account":true}'::jsonb)
on conflict (slug) do update set
  display_name=excluded.display_name,legal_name=excluded.legal_name,plan_key='enterprise',status='active',billing_exempt=true,timezone=excluded.timezone,locale=excluded.locale,updated_at=now();

insert into public.platform_agency_branding (agency_id,organisation_name,product_name,logo_url,logo_mark_url,support_email,powered_by_label)
select a.id,'DJM Sports Management','DJM PLAYER','/djm-mark.png','/djm-mark.png','jesse.edge@djmsports.com',null
from public.platform_agencies a where a.slug='djm'
on conflict (agency_id) do update set organisation_name=excluded.organisation_name,product_name=excluded.product_name,logo_url=excluded.logo_url,logo_mark_url=excluded.logo_mark_url,support_email=excluded.support_email,updated_at=now();

insert into public.platform_agency_domains (agency_id,hostname,is_primary,status,verified_at)
select a.id,'djm-player.vercel.app',true,'active',now() from public.platform_agencies a where a.slug='djm'
on conflict (hostname) do update set agency_id=excluded.agency_id,is_primary=true,status='active',verified_at=coalesce(public.platform_agency_domains.verified_at,excluded.verified_at),updated_at=now();

insert into public.platform_agency_infrastructure (agency_id,deployment_mode,provisioning_status,provisioned_at,metadata)
select a.id,'shared','ready',now(),'{"legacy_djm_runtime":true}'::jsonb from public.platform_agencies a where a.slug='djm'
on conflict (agency_id) do update set deployment_mode='shared',provisioning_status='ready',last_error=null,updated_at=now();

insert into public.platform_agency_memberships (agency_id,user_id,invited_email,role,status,accepted_at)
select a.id,u.id,lower(u.email),'owner','active',now()
from public.platform_agencies a join auth.users u on lower(u.email)='jesse.edge@djmsports.com'
where a.slug='djm'
on conflict do nothing;
