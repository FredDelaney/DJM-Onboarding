-- DJM Player staging application schema bootstrap
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Generated from the current production schema as a structure-only baseline.
-- No production data, auth users, secrets, cron jobs, storage objects, or outbound integrations belong in this file.
-- This file is being assembled and verified in controlled sections before any staging execution.

create schema if not exists djm_os;
create schema if not exists private;

-- ============================================================================
-- SECTION 1: public base tables
-- Columns, types, defaults, identity definitions and nullability mirror production.
-- Constraints, foreign keys, indexes, RLS, grants, functions and triggers are added
-- only after all base tables are present and are verified separately.
-- ============================================================================

create table public.admin_allowlist (
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  role text DEFAULT 'admin'::text NOT NULL
);

create table public.admin_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  pinned boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  target_player_id uuid,
  published boolean DEFAULT true NOT NULL,
  starts_at timestamp with time zone DEFAULT now() NOT NULL,
  ends_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  actor_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.calendar_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text DEFAULT encode(gen_random_bytes(32), 'hex'::text) NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.career_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  club_name text NOT NULL,
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
  is_international boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  source_name text,
  source_url text,
  source_reviewed_at timestamp with time zone,
  competition_id uuid,
  source_provider text,
  source_acceptance_method text,
  source_provider_player_id text,
  source_synced_at timestamp with time zone,
  stats_year smallint
);

create table public.club_share_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  label text,
  active boolean DEFAULT true NOT NULL,
  expires_at timestamp with time zone,
  view_count integer DEFAULT 0 NOT NULL,
  last_viewed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  opportunity_id uuid,
  organisation_id uuid,
  source_person_id uuid,
  pitch_message text,
  pitch_status text DEFAULT 'draft'::text NOT NULL,
  selected_sections jsonb DEFAULT '{}'::jsonb NOT NULL,
  sent_at timestamp with time zone,
  revoked_at timestamp with time zone
);

create table public.club_share_views (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  share_id uuid NOT NULL,
  viewed_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.email_outbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  url text DEFAULT '/home'::text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  dedupe_key text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sent_at timestamp with time zone
);

create table public.notification_outbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  url text DEFAULT '/inbox'::text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sent_at timestamp with time zone,
  dedupe_key text
);

create table public.notification_preferences (
  user_id uuid NOT NULL,
  player_requests boolean DEFAULT true NOT NULL,
  weekly_checkin_reminders boolean DEFAULT true NOT NULL,
  djm_announcements boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  push_enabled boolean DEFAULT true NOT NULL,
  email_enabled boolean DEFAULT false NOT NULL,
  task_reminders boolean DEFAULT true NOT NULL,
  reminder_mode text DEFAULT 'normal'::text NOT NULL,
  morning_brief boolean DEFAULT false NOT NULL,
  morning_brief_hour smallint DEFAULT 8 NOT NULL,
  timezone text DEFAULT 'UTC'::text NOT NULL,
  email_reminders boolean DEFAULT false NOT NULL,
  reminder_intensity text DEFAULT 'normal'::text NOT NULL,
  email_address text
);

create table public.player_agreements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  agreement_type text DEFAULT 'representation'::text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  title text,
  start_date date,
  end_date date,
  territory text,
  commission_terms text,
  document_id uuid,
  visible_to_player boolean DEFAULT true NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.player_cv_settings (
  player_id uuid NOT NULL,
  intro_line text,
  why_review text,
  hide_market_value boolean DEFAULT true NOT NULL,
  hidden_sections text[] DEFAULT '{}'::text[] NOT NULL,
  custom_sections jsonb DEFAULT '[]'::jsonb NOT NULL,
  section_order jsonb DEFAULT '["hero", "facts", "why_review", "stats", "career", "videos", "contact"]'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  career_summary text,
  key_stats jsonb DEFAULT '[]'::jsonb NOT NULL,
  notable_experience jsonb DEFAULT '[]'::jsonb NOT NULL,
  market_value_display text,
  market_value_source_url text
);

create table public.player_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  title text NOT NULL,
  document_type text DEFAULT 'other'::text NOT NULL,
  bucket_id text DEFAULT 'player-private'::text NOT NULL,
  object_path text NOT NULL,
  club_shareable boolean DEFAULT false NOT NULL,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  country text,
  expires_at date
);

create table public.player_invites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  player_id uuid,
  status text DEFAULT 'pending'::text NOT NULL,
  invited_by uuid,
  expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.player_onboarding (
  player_id uuid NOT NULL,
  current_step integer DEFAULT 1 NOT NULL,
  draft_state jsonb DEFAULT '{}'::jsonb NOT NULL,
  consent_given boolean DEFAULT false NOT NULL,
  consent_at timestamp with time zone,
  submitted_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  draft jsonb DEFAULT '{}'::jsonb NOT NULL,
  completed_at timestamp with time zone
);

create table public.player_opportunities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  club_name text NOT NULL,
  country text,
  contact_name text,
  contact_role text,
  stage text DEFAULT 'targeted'::text NOT NULL,
  summary text,
  next_action text,
  next_action_due date,
  owner_id uuid,
  last_contacted_at timestamp with time zone,
  outcome_note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.player_privacy_acceptances (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  user_id uuid NOT NULL,
  notice_version text NOT NULL,
  accepted_at timestamp with time zone DEFAULT now() NOT NULL,
  accepted_via text DEFAULT 'player_invite'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.player_private (
  player_id uuid NOT NULL,
  phone text,
  personal_email text,
  whatsapp text,
  residence_country text,
  relocation_preferences text,
  market_preferences text,
  salary_expectation text,
  travel_availability text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  passports_held text[] DEFAULT '{}'::text[] NOT NULL,
  work_rights text,
  preferred_move_timing text
);

create table public.player_public_profiles (
  player_id uuid NOT NULL,
  public_slug text NOT NULL,
  published boolean DEFAULT false NOT NULL,
  display_name text NOT NULL,
  headline text,
  primary_position text,
  secondary_positions text[] DEFAULT '{}'::text[] NOT NULL,
  preferred_foot text,
  age_display text,
  height_display text,
  nationalities text[] DEFAULT '{}'::text[] NOT NULL,
  current_status text,
  current_club text,
  key_stats jsonb DEFAULT '[]'::jsonb NOT NULL,
  why_review text,
  career_summary text,
  profile_photo_path text,
  hero_image_path text,
  primary_video_url text,
  transfermarkt_url text,
  wyscout_url text,
  contact_email text DEFAULT 'jesse.edge@djmsports.com'::text NOT NULL,
  published_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  career_timeline jsonb DEFAULT '[]'::jsonb NOT NULL,
  selected_videos jsonb DEFAULT '[]'::jsonb NOT NULL,
  notable_experience jsonb DEFAULT '[]'::jsonb NOT NULL,
  market_value_display text,
  market_value_source_url text,
  hidden_sections text[] DEFAULT '{}'::text[] NOT NULL,
  hide_market_value boolean DEFAULT true NOT NULL,
  verified_at timestamp with time zone,
  stats_url text
);

create table public.player_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  title text NOT NULL,
  message text,
  request_type text DEFAULT 'action'::text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  due_at timestamp with time zone,
  player_reply text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  assigned_to_user_id uuid
);

create table public.player_source_refreshes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  source text NOT NULL,
  source_url text,
  status text DEFAULT 'queued'::text NOT NULL,
  requested_by uuid,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  raw_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
  summary jsonb DEFAULT '{}'::jsonb NOT NULL,
  error_text text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  provider text NOT NULL,
  mode text DEFAULT 'preview'::text NOT NULL,
  started_at timestamp with time zone,
  facts_discovered integer DEFAULT 0 NOT NULL,
  review_required integer DEFAULT 0 NOT NULL,
  accepted_count integer DEFAULT 0 NOT NULL,
  rejected_count integer DEFAULT 0 NOT NULL,
  warning_messages text[] DEFAULT '{}'::text[] NOT NULL,
  provider_version text,
  payload_hash text,
  fresh_at timestamp with time zone,
  capability text DEFAULT 'manual_import'::text NOT NULL
);

create table public.player_source_suggestions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  refresh_id uuid NOT NULL,
  player_id uuid NOT NULL,
  field_name text NOT NULL,
  current_value jsonb,
  suggested_value jsonb,
  confidence numeric(4,3),
  source_evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  decision text DEFAULT 'pending'::text NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  evidence_id uuid,
  observed_at timestamp with time zone,
  truth_state text DEFAULT 'sourced'::text NOT NULL,
  applied_at timestamp with time zone
);

create table public.player_videos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  video_type text DEFAULT 'highlight'::text NOT NULL,
  featured boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.players (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  date_of_birth date,
  nationalities text[] DEFAULT '{}'::text[] NOT NULL,
  height_cm integer,
  preferred_foot text,
  primary_position text,
  secondary_positions text[] DEFAULT '{}'::text[] NOT NULL,
  current_club text,
  current_league text,
  current_country text,
  contract_status text,
  contract_expiry date,
  football_status text DEFAULT 'active'::text NOT NULL,
  transfermarkt_url text,
  wyscout_url text,
  stats_url text,
  instagram_url text,
  profile_photo_path text,
  onboarding_status text DEFAULT 'not_started'::text NOT NULL,
  verification_status text DEFAULT 'unverified'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  agency_priority text DEFAULT 'normal'::text NOT NULL,
  next_action text,
  next_action_due date,
  verified_at timestamp with time zone,
  verification_notes text,
  review_required_at timestamp with time zone,
  review_reason text,
  current_season_label text,
  current_season_start date,
  current_competition_id uuid,
  football_provider_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
  transfermarkt_market_value numeric(14,2),
  transfermarkt_market_value_currency text,
  transfermarkt_value_verified_at timestamp with time zone,
  primary_staff_user_id uuid
);

create table public.profiles (
  id uuid NOT NULL,
  email text,
  display_name text,
  role text DEFAULT 'player'::text NOT NULL,
  avatar_path text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  platform text,
  device_label text,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.request_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  message text,
  request_type text DEFAULT 'action'::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.resources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  resource_type text DEFAULT 'link'::text NOT NULL,
  url text,
  bucket_id text,
  object_path text,
  audience text DEFAULT 'players'::text NOT NULL,
  featured boolean DEFAULT false NOT NULL,
  published boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.site_content (
  key text NOT NULL,
  eyebrow text,
  title text NOT NULL,
  body text,
  cta_label text,
  cta_href text,
  secondary_label text,
  secondary_href text,
  published boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table public.staff_player_access (
  staff_user_id uuid NOT NULL,
  player_id uuid NOT NULL,
  can_edit boolean DEFAULT false NOT NULL
);

create table public.weekly_checkins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  week_start date NOT NULL,
  availability_status text,
  club_situation_changed boolean DEFAULT false NOT NULL,
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
  submitted_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================================================
-- SECTION 2: private base tables
-- Structure only. No production rows, API keys, push keys, scheduler secrets,
-- email credentials, or other configuration values are copied.
-- Constraints, grants and functions are added only in later verified sections.
-- ============================================================================

create table private.djm_competition_tier_aliases (
  country_key text NOT NULL,
  league_key text NOT NULL,
  country_name text NOT NULL,
  canonical_name text NOT NULL,
  tier smallint NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

create table private.djm_email_config (
  singleton boolean DEFAULT true NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  provider text DEFAULT 'resend'::text NOT NULL,
  api_key text,
  from_address text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table private.push_scheduler_config (
  singleton boolean DEFAULT true NOT NULL,
  secret text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

create table private.web_push_config (
  singleton boolean DEFAULT true NOT NULL,
  subject text NOT NULL,
  public_key text NOT NULL,
  private_key text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
