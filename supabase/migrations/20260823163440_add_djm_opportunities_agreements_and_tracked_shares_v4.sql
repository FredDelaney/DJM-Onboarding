alter table public.players add column if not exists review_required_at timestamptz;
alter table public.players add column if not exists review_reason text;

create or replace function private.can_staff_view_player(target_player_id uuid)
returns boolean
language sql
stable security definer
set search_path = public, pg_catalog
as $$
  select private.is_admin()
    or exists (select 1 from public.staff_player_access a where a.player_id=target_player_id and a.staff_user_id=auth.uid());
$$;
revoke all on function private.can_staff_view_player(uuid) from public, anon;
grant execute on function private.can_staff_view_player(uuid) to authenticated, service_role;

create or replace function private.can_staff_edit_player(target_player_id uuid)
returns boolean
language sql
stable security definer
set search_path = public, pg_catalog
as $$
  select private.is_admin()
    or exists (select 1 from public.staff_player_access a where a.player_id=target_player_id and a.staff_user_id=auth.uid() and a.can_edit=true);
$$;
revoke all on function private.can_staff_edit_player(uuid) from public, anon;
grant execute on function private.can_staff_edit_player(uuid) to authenticated, service_role;

create table if not exists public.player_opportunities (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  club_name text not null,
  country text,
  contact_name text,
  contact_role text,
  stage text not null default 'targeted' check (stage in ('watching','targeted','contacted','materials_sent','interested','meeting_trial','offer','won','lost','paused')),
  summary text,
  next_action text,
  next_action_due date,
  owner_id uuid references auth.users(id) on delete set null,
  last_contacted_at timestamptz,
  outcome_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists player_opportunities_player_id_idx on public.player_opportunities(player_id);
create index if not exists player_opportunities_stage_idx on public.player_opportunities(stage);
create index if not exists player_opportunities_due_idx on public.player_opportunities(next_action_due);
alter table public.player_opportunities enable row level security;
grant select,insert,update,delete on public.player_opportunities to authenticated;
drop policy if exists "staff view opportunities" on public.player_opportunities;
create policy "staff view opportunities" on public.player_opportunities for select to authenticated using (private.can_staff_view_player(player_id));
drop policy if exists "staff insert opportunities" on public.player_opportunities;
create policy "staff insert opportunities" on public.player_opportunities for insert to authenticated with check (private.can_staff_edit_player(player_id));
drop policy if exists "staff update opportunities" on public.player_opportunities;
create policy "staff update opportunities" on public.player_opportunities for update to authenticated using (private.can_staff_edit_player(player_id)) with check (private.can_staff_edit_player(player_id));
drop policy if exists "staff delete opportunities" on public.player_opportunities;
create policy "staff delete opportunities" on public.player_opportunities for delete to authenticated using (private.can_staff_edit_player(player_id));
drop trigger if exists player_opportunities_updated_at on public.player_opportunities;
create trigger player_opportunities_updated_at before update on public.player_opportunities for each row execute function private.set_updated_at();

create table if not exists public.player_agreements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  agreement_type text not null default 'representation' check (agreement_type in ('representation','placement_authorisation','mandate','cooperation','image_rights','commercial','nda','other')),
  status text not null default 'draft' check (status in ('draft','active','expired','terminated','superseded')),
  title text,
  start_date date,
  end_date date,
  territory text,
  commission_terms text,
  document_id uuid references public.player_documents(id) on delete set null,
  visible_to_player boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists player_agreements_player_id_idx on public.player_agreements(player_id);
create index if not exists player_agreements_end_date_idx on public.player_agreements(end_date);
alter table public.player_agreements enable row level security;
grant select,insert,update,delete on public.player_agreements to authenticated;
drop policy if exists "agreements view" on public.player_agreements;
create policy "agreements view" on public.player_agreements for select to authenticated using (private.is_admin() or (visible_to_player and exists(select 1 from public.players p where p.id=player_id and p.user_id=auth.uid())));
drop policy if exists "admins insert agreements" on public.player_agreements;
create policy "admins insert agreements" on public.player_agreements for insert to authenticated with check (private.is_admin());
drop policy if exists "admins update agreements" on public.player_agreements;
create policy "admins update agreements" on public.player_agreements for update to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "admins delete agreements" on public.player_agreements;
create policy "admins delete agreements" on public.player_agreements for delete to authenticated using (private.is_admin());
drop trigger if exists player_agreements_updated_at on public.player_agreements;
create trigger player_agreements_updated_at before update on public.player_agreements for each row execute function private.set_updated_at();

create table if not exists public.club_share_links (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  label text,
  active boolean not null default true,
  expires_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists club_share_links_player_id_idx on public.club_share_links(player_id);
create index if not exists club_share_links_token_idx on public.club_share_links(token);
alter table public.club_share_links enable row level security;
revoke all on public.club_share_links from anon;
grant select,insert,update,delete on public.club_share_links to authenticated;
drop policy if exists "admins manage club share links" on public.club_share_links;
create policy "admins manage club share links" on public.club_share_links for all to authenticated using (private.is_admin()) with check (private.is_admin());

create table if not exists public.club_share_views (
  id bigint generated always as identity primary key,
  share_id uuid not null references public.club_share_links(id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index if not exists club_share_views_share_id_idx on public.club_share_views(share_id);
alter table public.club_share_views enable row level security;
revoke all on public.club_share_views from anon, authenticated;
grant select on public.club_share_views to authenticated;
drop policy if exists "admins view club share events" on public.club_share_views;
create policy "admins view club share events" on public.club_share_views for select to authenticated using (private.is_admin());

create or replace function public.get_club_share(share_token uuid)
returns jsonb
language sql
stable security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'share_id', s.id,
    'expires_at', s.expires_at,
    'profile', to_jsonb(pp)
  )
  from public.club_share_links s
  join public.player_public_profiles pp on pp.player_id=s.player_id
  where s.token=share_token
    and s.active=true
    and (s.expires_at is null or s.expires_at > now())
    and pp.published=true
  limit 1;
$$;
revoke all on function public.get_club_share(uuid) from public;
grant execute on function public.get_club_share(uuid) to anon, authenticated;

create or replace function public.track_club_share_view(share_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare share_row public.club_share_links%rowtype;
begin
  select * into share_row from public.club_share_links
  where token=share_token and active=true and (expires_at is null or expires_at > now())
  for update;
  if share_row.id is null then return false; end if;
  insert into public.club_share_views(share_id) values (share_row.id);
  update public.club_share_links set view_count=view_count+1,last_viewed_at=now() where id=share_row.id;
  return true;
end;
$$;
revoke all on function public.track_club_share_view(uuid) from public;
grant execute on function public.track_club_share_view(uuid) to anon, authenticated;

create or replace function private.protect_player_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not private.is_admin() then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verification_notes is distinct from old.verification_notes
       or new.review_required_at is distinct from old.review_required_at
       or new.review_reason is distinct from old.review_reason
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change protected player fields';
    end if;

    if old.verification_status='verified' and (
      new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name or new.preferred_name is distinct from old.preferred_name or
      new.date_of_birth is distinct from old.date_of_birth or new.nationalities is distinct from old.nationalities or new.height_cm is distinct from old.height_cm or
      new.preferred_foot is distinct from old.preferred_foot or new.primary_position is distinct from old.primary_position or new.secondary_positions is distinct from old.secondary_positions or
      new.current_club is distinct from old.current_club or new.current_league is distinct from old.current_league or new.current_country is distinct from old.current_country or
      new.contract_status is distinct from old.contract_status or new.contract_expiry is distinct from old.contract_expiry or new.football_status is distinct from old.football_status or
      new.transfermarkt_url is distinct from old.transfermarkt_url or new.wyscout_url is distinct from old.wyscout_url or new.stats_url is distinct from old.stats_url or
      new.profile_photo_path is distinct from old.profile_photo_path
    ) then
      new.verification_status := 'reviewing';
      new.verified_at := null;
      new.review_required_at := now();
      new.review_reason := 'Player updated verified football information';
    end if;
  end if;
  return new;
end;
$$;
