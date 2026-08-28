create table if not exists public.player_source_refreshes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  source text not null,
  source_url text,
  status text not null default 'queued',
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  raw_snapshot jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_source_refreshes_source_check check (source in ('wyscout','sportmonks','transfermarkt_reference','manual','other')),
  constraint player_source_refreshes_status_check check (status in ('queued','running','needs_review','applied','failed','cancelled'))
);

create table if not exists public.player_source_suggestions (
  id uuid primary key default gen_random_uuid(),
  refresh_id uuid not null references public.player_source_refreshes(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  field_name text not null,
  current_value jsonb,
  suggested_value jsonb,
  confidence numeric(4,3),
  source_evidence jsonb not null default '{}'::jsonb,
  decision text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint player_source_suggestions_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint player_source_suggestions_decision_check check (decision in ('pending','accepted','rejected'))
);

create index if not exists player_source_refreshes_player_idx on public.player_source_refreshes(player_id, requested_at desc);
create index if not exists player_source_refreshes_status_idx on public.player_source_refreshes(status, requested_at desc);
create index if not exists player_source_suggestions_refresh_idx on public.player_source_suggestions(refresh_id);
create index if not exists player_source_suggestions_player_decision_idx on public.player_source_suggestions(player_id, decision);

alter table public.player_source_refreshes enable row level security;
alter table public.player_source_suggestions enable row level security;
grant select,insert,update,delete on public.player_source_refreshes to authenticated;
grant select,insert,update,delete on public.player_source_suggestions to authenticated;

create policy "admins manage source refreshes" on public.player_source_refreshes for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage source suggestions" on public.player_source_suggestions for all to authenticated using (private.is_admin()) with check (private.is_admin());
