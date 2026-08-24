alter table public.player_onboarding
add column if not exists draft jsonb not null default '{}'::jsonb;

alter table public.player_onboarding
add column if not exists completed_at timestamptz;

update public.player_onboarding
set
  draft = coalesce(draft_state, '{}'::jsonb),
  completed_at = submitted_at
where draft = '{}'::jsonb
  and completed_at is null;
