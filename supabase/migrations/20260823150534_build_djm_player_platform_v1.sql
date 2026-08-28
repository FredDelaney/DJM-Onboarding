create extension if not exists pgcrypto;

create table public.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.admin_allowlist(email)
values ('jesse.edge@djmsports.com')
on conflict (email) do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'player' check (role in ('player','admin','scout')),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  first_name text,
  last_name text,
  preferred_name text,
  date_of_birth date,
  nationalities text[] not null default '{}',
  height_cm integer check (height_cm is null or height_cm between 140 and 230),
  preferred_foot text check (preferred_foot is null or preferred_foot in ('left','right','both')),
  primary_position text,
  secondary_positions text[] not null default '{}',
  current_club text,
  current_league text,
  current_country text,
  contract_status text,
  contract_expiry date,
  football_status text not null default 'active' check (football_status in ('active','free_agent','loan','injured','retired','other')),
  transfermarkt_url text,
  wyscout_url text,
  stats_url text,
  instagram_url text,
  profile_photo_path text,
  onboarding_status text not null default 'not_started' check (onboarding_status in ('not_started','in_progress','submitted','verified')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','reviewing','verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_private (
  player_id uuid primary key references public.players(id) on delete cascade,
  phone text,
  personal_email text,
  whatsapp text,
  residence_country text,
  relocation_preferences text,
  market_preferences text,
  salary_expectation text,
  travel_availability text,
  private_agent_context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_onboarding (
  player_id uuid primary key references public.players(id) on delete cascade,
  current_step integer not null default 1 check (current_step between 1 and 20),
  draft_state jsonb not null default '{}'::jsonb,
  consent_given boolean not null default false,
  consent_at timestamptz,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.player_public_profiles (
  player_id uuid primary key references public.players(id) on delete cascade,
  public_slug text unique not null,
  published boolean not null default false,
  display_name text not null,
  headline text,
  primary_position text,
  secondary_positions text[] not null default '{}',
  preferred_foot text,
  age_display text,
  height_display text,
  nationalities text[] not null default '{}',
  current_status text,
  current_club text,
  key_stats jsonb not null default '[]'::jsonb,
  why_review text,
  career_summary text,
  profile_photo_path text,
  hero_image_path text,
  primary_video_url text,
  transfermarkt_url text,
  wyscout_url text,
  contact_email text not null default 'jesse.edge@djmsports.com',
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.career_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  club_name text not null,
  country text,
  league text,
  season_label text,
  start_date date,
  end_date date,
  appearances integer,
  starts integer,
  minutes integer,
  goals integer,
  assists integer,
  notes text,
  is_international boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_videos (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  title text not null,
  url text not null,
  video_type text not null default 'highlight' check (video_type in ('highlight','full_match','clip','analysis','other')),
  featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_documents (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  title text not null,
  document_type text not null default 'other',
  bucket_id text not null default 'player-private',
  object_path text not null,
  club_shareable boolean not null default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  week_start date not null,
  availability_status text,
  club_situation_changed boolean not null default false,
  club_situation_notes text,
  matches_played integer,
  minutes_played integer,
  goals integer,
  assists integer,
  fitness_status text,
  fitness_notes text,
  external_contact text,
  travel_availability text,
  support_request text,
  player_notes text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(player_id, week_start)
);

create table public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_cv_settings (
  player_id uuid primary key references public.players(id) on delete cascade,
  intro_line text,
  why_review text,
  hide_market_value boolean not null default true,
  hidden_sections text[] not null default '{}',
  custom_sections jsonb not null default '[]'::jsonb,
  section_order jsonb not null default '["hero","facts","why_review","stats","career","videos","contact"]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  resource_type text not null default 'link' check (resource_type in ('link','document','video','article','contact','other')),
  url text,
  bucket_id text,
  object_path text,
  audience text not null default 'players' check (audience in ('players','staff','all')),
  featured boolean not null default false,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target_player_id uuid references public.players(id) on delete cascade,
  published boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_player_access (
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  can_edit boolean not null default false,
  primary key(staff_user_id, player_id)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.can_view_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or exists (select 1 from public.staff_player_access a where a.player_id = target_player_id and a.staff_user_id = auth.uid());
$$;

create or replace function public.can_edit_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or exists (select 1 from public.staff_player_access a where a.player_id = target_player_id and a.staff_user_id = auth.uid() and a.can_edit = true);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text := 'player';
begin
  if exists (select 1 from public.admin_allowlist where lower(email) = lower(new.email)) then
    assigned_role := 'admin';
  end if;

  insert into public.profiles(id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)),
    assigned_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger players_updated_at before update on public.players for each row execute procedure public.set_updated_at();
create trigger player_private_updated_at before update on public.player_private for each row execute procedure public.set_updated_at();
create trigger player_onboarding_updated_at before update on public.player_onboarding for each row execute procedure public.set_updated_at();
create trigger public_profiles_updated_at before update on public.player_public_profiles for each row execute procedure public.set_updated_at();
create trigger career_entries_updated_at before update on public.career_entries for each row execute procedure public.set_updated_at();
create trigger player_videos_updated_at before update on public.player_videos for each row execute procedure public.set_updated_at();
create trigger admin_notes_updated_at before update on public.admin_notes for each row execute procedure public.set_updated_at();
create trigger cv_settings_updated_at before update on public.player_cv_settings for each row execute procedure public.set_updated_at();
create trigger resources_updated_at before update on public.resources for each row execute procedure public.set_updated_at();
create trigger announcements_updated_at before update on public.announcements for each row execute procedure public.set_updated_at();

create index players_user_id_idx on public.players(user_id);
create index players_onboarding_status_idx on public.players(onboarding_status);
create index career_entries_player_idx on public.career_entries(player_id, sort_order);
create index player_videos_player_idx on public.player_videos(player_id, sort_order);
create index weekly_checkins_player_idx on public.weekly_checkins(player_id, week_start desc);
create index admin_notes_player_idx on public.admin_notes(player_id, created_at desc);
create index announcements_target_idx on public.announcements(target_player_id, starts_at desc);

alter table public.admin_allowlist enable row level security;
alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.player_private enable row level security;
alter table public.player_onboarding enable row level security;
alter table public.player_public_profiles enable row level security;
alter table public.career_entries enable row level security;
alter table public.player_videos enable row level security;
alter table public.player_documents enable row level security;
alter table public.weekly_checkins enable row level security;
alter table public.admin_notes enable row level security;
alter table public.player_cv_settings enable row level security;
alter table public.resources enable row level security;
alter table public.announcements enable row level security;
alter table public.staff_player_access enable row level security;
alter table public.audit_events enable row level security;

create policy "admins manage allowlist" on public.admin_allowlist for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "users read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "players and staff view player" on public.players for select to authenticated using (public.can_view_player(id));
create policy "players and staff update player" on public.players for update to authenticated using (public.can_edit_player(id)) with check (public.can_edit_player(id));
create policy "admins create players" on public.players for insert to authenticated with check (public.is_admin());
create policy "admins delete players" on public.players for delete to authenticated using (public.is_admin());

create policy "player private view" on public.player_private for select to authenticated using (public.can_view_player(player_id));
create policy "player private edit" on public.player_private for all to authenticated using (public.can_edit_player(player_id)) with check (public.can_edit_player(player_id));

create policy "onboarding view" on public.player_onboarding for select to authenticated using (public.can_view_player(player_id));
create policy "onboarding edit" on public.player_onboarding for all to authenticated using (public.can_edit_player(player_id)) with check (public.can_edit_player(player_id));

create policy "public club profiles readable" on public.player_public_profiles for select to anon, authenticated using (published = true or public.can_view_player(player_id));
create policy "public profiles editable" on public.player_public_profiles for all to authenticated using (public.can_edit_player(player_id)) with check (public.can_edit_player(player_id));

create policy "career entries view" on public.career_entries for select to authenticated using (public.can_view_player(player_id));
create policy "career entries edit" on public.career_entries for all to authenticated using (public.can_edit_player(player_id)) with check (public.can_edit_player(player_id));

create policy "videos view" on public.player_videos for select to authenticated using (public.can_view_player(player_id));
create policy "videos edit" on public.player_videos for all to authenticated using (public.can_edit_player(player_id)) with check (public.can_edit_player(player_id));

create policy "documents view" on public.player_documents for select to authenticated using (public.can_view_player(player_id));
create policy "documents edit" on public.player_documents for all to authenticated using (public.can_edit_player(player_id)) with check (public.can_edit_player(player_id));

create policy "checkins view" on public.weekly_checkins for select to authenticated using (public.can_view_player(player_id));
create policy "checkins edit" on public.weekly_checkins for all to authenticated using (public.can_edit_player(player_id)) with check (public.can_edit_player(player_id));

create policy "admin notes staff only" on public.admin_notes for all to authenticated using (public.is_admin() or exists (select 1 from public.staff_player_access a where a.player_id = admin_notes.player_id and a.staff_user_id = auth.uid())) with check (public.is_admin() or exists (select 1 from public.staff_player_access a where a.player_id = admin_notes.player_id and a.staff_user_id = auth.uid() and a.can_edit));

create policy "cv settings view" on public.player_cv_settings for select to authenticated using (public.can_view_player(player_id));
create policy "cv settings edit" on public.player_cv_settings for all to authenticated using (public.can_edit_player(player_id)) with check (public.can_edit_player(player_id));

create policy "players read resources" on public.resources for select to authenticated using ((published = true and audience in ('players','all')) or public.is_admin());
create policy "admins manage resources" on public.resources for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "players read announcements" on public.announcements for select to authenticated using (published = true and starts_at <= now() and (ends_at is null or ends_at >= now()) and (target_player_id is null or public.can_view_player(target_player_id)));
create policy "admins manage announcements" on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins manage staff access" on public.staff_player_access for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff can read own access" on public.staff_player_access for select to authenticated using (staff_user_id = auth.uid() or public.is_admin());

create policy "admins read audit" on public.audit_events for select to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('player-public', 'player-public', true, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('player-private', 'player-private', false, 26214400, array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload own public media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'player-public' and (
    public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create policy "users update own public media"
on storage.objects for update to authenticated
using (
  bucket_id = 'player-public' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
)
with check (
  bucket_id = 'player-public' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

create policy "users delete own public media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'player-public' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

create policy "users read own private files"
on storage.objects for select to authenticated
using (
  bucket_id = 'player-private' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

create policy "users upload own private files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'player-private' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

create policy "users update own private files"
on storage.objects for update to authenticated
using (
  bucket_id = 'player-private' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
)
with check (
  bucket_id = 'player-private' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

create policy "users delete own private files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'player-private' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);
