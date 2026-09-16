create index if not exists player_career_exceptions_approved_by_idx on platform.player_career_exceptions(approved_by);
create index if not exists player_career_exceptions_created_by_idx on platform.player_career_exceptions(created_by);
create index if not exists player_career_exceptions_rejected_by_idx on platform.player_career_exceptions(rejected_by);
create index if not exists player_career_exceptions_updated_by_idx on platform.player_career_exceptions(updated_by);
create index if not exists tenant_service_standards_updated_by_idx on platform.tenant_service_standards(updated_by);;
