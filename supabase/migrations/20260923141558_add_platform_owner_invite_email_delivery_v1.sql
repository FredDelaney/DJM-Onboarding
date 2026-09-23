create table if not exists private.platform_email_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  provider text not null default 'resend'
    check (provider in ('resend')),
  api_key text null,
  from_address text null,
  reply_to text null,
  app_base_url text null,
  updated_at timestamptz not null default now()
);

revoke all on table private.platform_email_config
  from public, anon, authenticated;

comment on table private.platform_email_config is
  'Private transactional email configuration for the ReDream platform control plane. Never browser-readable.';

create or replace function public.platform_server_email_delivery_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce(c.enabled, false),
    'provider', c.provider,
    'api_key', c.api_key,
    'from_address', c.from_address,
    'reply_to', c.reply_to,
    'app_base_url', c.app_base_url
  )
  from private.platform_email_config c
  where c.singleton = true
  limit 1;
$$;

revoke all on function public.platform_server_email_delivery_config()
  from public, anon, authenticated;
grant execute on function public.platform_server_email_delivery_config()
  to service_role;

comment on function public.platform_server_email_delivery_config() is
  'Service-role only ReDream transactional email configuration. Includes provider secret and must never be returned to a browser.';
