-- Internal football intelligence tables are service-owned and must not be directly exposed.
-- They intentionally have no anon/authenticated table grants; SECURITY DEFINER/service paths remain available.
alter table djm_os.football_intelligence_subjects enable row level security;
alter table djm_os.football_subject_projection_snapshots enable row level security;
alter table djm_os.football_subject_provider_snapshots enable row level security;
alter table djm_os.football_subject_scorecards enable row level security;;
