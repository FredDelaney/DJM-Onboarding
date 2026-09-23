create table if not exists platform.demo_requests (
  id uuid primary key default gen_random_uuid(),
  client_request_id uuid not null unique,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null check (char_length(email) between 3 and 320),
  agency_name text not null check (char_length(agency_name) between 2 and 160),
  website_url text null check (website_url is null or char_length(website_url) <= 500),
  staff_size text not null check (staff_size in ('1-5', '6-15', '16-30', '31+')),
  player_count text not null check (player_count in ('1-40', '41-100', '101-250', '251+')),
  priority text null check (priority is null or char_length(priority) <= 2000),
  requested_plan text null check (requested_plan is null or requested_plan in ('agency', 'pro', 'elite', 'enterprise')),
  source_host text null check (source_host is null or char_length(source_host) <= 255),
  source_path text null check (source_path is null or char_length(source_path) <= 500),
  referrer text null check (referrer is null or char_length(referrer) <= 1000),
  user_agent text null check (user_agent is null or char_length(user_agent) <= 500),
  consent_at timestamptz not null,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'converted', 'closed')),
  converted_tenant_id uuid null references platform.tenants(id) on delete set null,
  contacted_at timestamptz null,
  contacted_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint demo_request_converted_tenant_check
    check (
      (status = 'converted' and converted_tenant_id is not null)
      or status <> 'converted'
    )
);

alter table platform.demo_requests enable row level security;

revoke all on table platform.demo_requests from public, anon, authenticated;
grant select, insert, update on table platform.demo_requests to service_role;

create index if not exists demo_requests_status_created_idx
  on platform.demo_requests (status, created_at desc);

create index if not exists demo_requests_email_created_idx
  on platform.demo_requests (lower(email), created_at desc);

comment on table platform.demo_requests is
  'Public ReDream demo enquiries. This is a prospect record only and never provisions a tenant or starts a trial.';
