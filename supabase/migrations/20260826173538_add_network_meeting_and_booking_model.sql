create table if not exists djm_os.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references djm_os.team_members(user_id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  external_account_id text,
  calendar_id text,
  email text,
  status text not null default 'pending' check (status in ('pending','connected','error','disabled')),
  scopes text[] not null default '{}'::text[],
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,provider)
);

create table if not exists djm_os.meetings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references djm_os.team_members(user_id) on delete restrict,
  person_id uuid references djm_os.people(id) on delete set null,
  organisation_id uuid references djm_os.organisations(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text,
  provider text check (provider in ('google','microsoft','manual')),
  external_event_id text,
  meeting_url text,
  invitee_email text,
  status text not null default 'scheduled' check (status in ('draft','scheduled','completed','cancelled','no_show')),
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists djm_os.booking_profiles (
  user_id uuid primary key references djm_os.team_members(user_id) on delete cascade,
  slug text not null unique,
  is_enabled boolean not null default false,
  default_duration_minutes smallint not null default 30 check (default_duration_minutes between 10 and 120),
  minimum_notice_hours smallint not null default 12 check (minimum_notice_hours between 0 and 168),
  buffer_minutes smallint not null default 15 check (buffer_minutes between 0 and 60),
  timezone text not null default 'Europe/Rome',
  availability jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists djm_os.booking_requests (
  id uuid primary key default gen_random_uuid(),
  booking_user_id uuid not null references djm_os.team_members(user_id) on delete restrict,
  person_id uuid references djm_os.people(id) on delete set null,
  organisation_id uuid references djm_os.organisations(id) on delete set null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text,
  status text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled')),
  meeting_id uuid references djm_os.meetings(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists djm_os_meetings_owner_time_idx on djm_os.meetings(owner_user_id,starts_at);
create index if not exists djm_os_meetings_person_idx on djm_os.meetings(person_id,starts_at desc);
create index if not exists djm_os_booking_requests_owner_idx on djm_os.booking_requests(booking_user_id,status,starts_at);

grant select,insert,update,delete on djm_os.calendar_connections,djm_os.meetings,djm_os.booking_profiles,djm_os.booking_requests to authenticated;
alter table djm_os.calendar_connections enable row level security;
alter table djm_os.meetings enable row level security;
alter table djm_os.booking_profiles enable row level security;
alter table djm_os.booking_requests enable row level security;

do $$ declare t text; begin
  foreach t in array array['calendar_connections','meetings','booking_profiles','booking_requests'] loop
    execute format('drop policy if exists djm_team_select on djm_os.%I',t);
    execute format('drop policy if exists djm_team_insert on djm_os.%I',t);
    execute format('drop policy if exists djm_team_update on djm_os.%I',t);
    execute format('drop policy if exists djm_team_delete on djm_os.%I',t);
    execute format('create policy djm_team_select on djm_os.%I for select to authenticated using ((select djm_os.is_team_member()))',t);
    execute format('create policy djm_team_insert on djm_os.%I for insert to authenticated with check ((select djm_os.is_team_member()))',t);
    execute format('create policy djm_team_update on djm_os.%I for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()))',t);
    execute format('create policy djm_team_delete on djm_os.%I for delete to authenticated using ((select djm_os.is_team_member()))',t);
  end loop;
end $$;

create or replace function public.djm_network_meetings(p_scope text default 'mine',p_from timestamptz default now()-interval '30 days',p_to timestamptz default now()+interval '180 days')
returns table(
  id uuid,owner_user_id uuid,owner_name text,person_id uuid,person_name text,organisation_id uuid,organisation_name text,
  title text,starts_at timestamptz,ends_at timestamptz,timezone text,provider text,meeting_url text,invitee_email text,status text,source text
)
language sql stable security invoker set search_path=''
as $$
  select m.id,m.owner_user_id,tm.display_name,m.person_id,p.full_name,m.organisation_id,o.name,m.title,m.starts_at,m.ends_at,m.timezone,m.provider,m.meeting_url,m.invitee_email,m.status,m.source
  from djm_os.meetings m
  join djm_os.team_members tm on tm.user_id=m.owner_user_id
  left join djm_os.people p on p.id=m.person_id
  left join djm_os.organisations o on o.id=m.organisation_id
  where (p_scope='all' or m.owner_user_id=auth.uid()) and m.starts_at>=p_from and m.starts_at<=p_to
  order by m.starts_at;
$$;

create or replace function public.djm_network_create_meeting_draft(
  p_title text,p_starts_at timestamptz,p_ends_at timestamptz,p_person_id uuid default null,p_organisation_id uuid default null,p_invitee_email text default null,p_timezone text default null
)
returns jsonb
language plpgsql security invoker set search_path=''
as $$ declare v_id uuid; begin
  if p_title is null or length(trim(p_title))<2 then raise exception 'Meeting title is required'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Valid meeting times are required'; end if;
  insert into djm_os.meetings(owner_user_id,person_id,organisation_id,title,starts_at,ends_at,timezone,provider,invitee_email,status,source)
  values(auth.uid(),p_person_id,p_organisation_id,trim(p_title),p_starts_at,p_ends_at,coalesce(nullif(trim(p_timezone),''),'Europe/Rome'),'manual',nullif(trim(p_invitee_email),''),'draft','network')
  returning id into v_id;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
  values('MEETING_DRAFT_CREATED',auth.uid(),p_person_id,p_organisation_id,jsonb_build_object('meeting_id',v_id,'starts_at',p_starts_at,'ends_at',p_ends_at),'network',1,now());
  return jsonb_build_object('meeting_id',v_id,'status','draft');
end; $$;

create or replace function public.djm_network_booking_profiles()
returns table(user_id uuid,display_name text,slug text,is_enabled boolean,default_duration_minutes smallint,minimum_notice_hours smallint,buffer_minutes smallint,timezone text,availability jsonb)
language sql stable security invoker set search_path=''
as $$
  select b.user_id,t.display_name,b.slug,b.is_enabled,b.default_duration_minutes,b.minimum_notice_hours,b.buffer_minutes,b.timezone,b.availability
  from djm_os.booking_profiles b join djm_os.team_members t on t.user_id=b.user_id order by t.display_name;
$$;

insert into djm_os.booking_profiles(user_id,slug,is_enabled,timezone)
select user_id,'jesse',false,coalesce(timezone,'Europe/Rome') from djm_os.team_members where lower(display_name) like 'jesse%'
on conflict(user_id) do nothing;

revoke execute on function public.djm_network_meetings(text,timestamptz,timestamptz) from public,anon;
revoke execute on function public.djm_network_create_meeting_draft(text,timestamptz,timestamptz,uuid,uuid,text,text) from public,anon;
revoke execute on function public.djm_network_booking_profiles() from public,anon;
grant execute on function public.djm_network_meetings(text,timestamptz,timestamptz) to authenticated;
grant execute on function public.djm_network_create_meeting_draft(text,timestamptz,timestamptz,uuid,uuid,text,text) to authenticated;
grant execute on function public.djm_network_booking_profiles() to authenticated;
notify pgrst,'reload schema';
