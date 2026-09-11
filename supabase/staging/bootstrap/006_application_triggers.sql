-- DJM Player staging trigger bootstrap
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after all private, djm_os and public function bootstrap batches.
--
-- Exact current-production definitions for 77 application triggers across
-- public and djm_os tables.
-- Production body MD5: 5807730feb62150e37d52f4161563d78
--
-- Trigger functions must already exist before this file is applied.
-- No trigger is fired merely by creating it.

begin;
set local search_path = public, extensions;

CREATE TRIGGER trg_djm_need_match_refresh AFTER INSERT OR UPDATE OF "position", secondary_position, preferred_foot, min_age, max_age, min_height_cm, transfer_type, transfer_budget, salary_budget, salary_tax_basis, nationality_preferences, passport_requirements, foreign_player_notes, playing_style, profile_notes, registration_notes, status ON djm_os.club_needs FOR EACH ROW EXECUTE FUNCTION djm_os.club_need_match_trigger();

CREATE TRIGGER trg_football_subject_immediate_score AFTER INSERT OR UPDATE OF representation_status, date_of_birth, primary_position, current_club, current_league, current_country, current_competition_id, current_season_label, current_season_start, football_provider_ids ON djm_os.football_intelligence_subjects FOR EACH ROW EXECUTE FUNCTION djm_os.refresh_football_subject_scorecard_trigger();

CREATE TRIGGER trg_football_subject_career_score AFTER INSERT OR DELETE OR UPDATE ON djm_os.football_subject_career_entries FOR EACH ROW EXECUTE FUNCTION djm_os.refresh_football_subject_from_career_trigger();

CREATE TRIGGER trg_football_subject_match_score AFTER INSERT OR DELETE OR UPDATE ON djm_os.football_subject_match_snapshots FOR EACH ROW EXECUTE FUNCTION djm_os.refresh_football_subject_from_match_trigger();

CREATE TRIGGER trg_football_subject_provider_score AFTER INSERT OR DELETE OR UPDATE ON djm_os.football_subject_provider_snapshots FOR EACH ROW EXECUTE FUNCTION djm_os.refresh_football_subject_score_from_provider_trigger();

CREATE TRIGGER trg_sync_official_subject_career_snapshot AFTER INSERT OR UPDATE OF metrics, season_label, club_name, competition_name, observed_at, synced_at ON djm_os.football_subject_provider_snapshots FOR EACH ROW EXECUTE FUNCTION djm_os.sync_official_subject_career_snapshot();

CREATE TRIGGER trg_football_subject_projection_refresh AFTER INSERT OR UPDATE OF display_score, confidence, data_coverage, position_group, model_version ON djm_os.football_subject_scorecards FOR EACH ROW EXECUTE FUNCTION djm_os.refresh_projection_from_score_trigger();

CREATE TRIGGER djm_benchmark_score_stale AFTER INSERT OR DELETE OR UPDATE OF strength_score, verified_at, competition_id ON djm_os.league_benchmarks FOR EACH ROW EXECUTE FUNCTION private.djm_benchmark_score_stale_trigger();

CREATE TRIGGER djm_v5_score_stale_benchmark AFTER INSERT OR DELETE OR UPDATE ON djm_os.league_benchmarks FOR EACH ROW EXECUTE FUNCTION private.djm_v5_mark_score_stale_from_benchmark();

CREATE TRIGGER trg_djm_message_process AFTER INSERT ON djm_os.messages FOR EACH ROW EXECUTE FUNCTION djm_os.message_after_insert_trigger();

CREATE TRIGGER trg_mirror_player_match_to_subject AFTER INSERT OR DELETE OR UPDATE ON djm_os.player_match_stat_snapshots FOR EACH ROW EXECUTE FUNCTION djm_os.mirror_player_match_to_subject();

CREATE TRIGGER djm_v5_score_stale_performance AFTER INSERT OR DELETE OR UPDATE ON djm_os.player_performance_snapshots FOR EACH ROW EXECUTE FUNCTION private.djm_v5_mark_player_score_stale_from_input();

CREATE TRIGGER trg_global_score_from_reviewed_performance AFTER INSERT OR DELETE OR UPDATE ON djm_os.player_performance_snapshots FOR EACH ROW EXECUTE FUNCTION djm_os.refresh_subject_from_player_performance_trigger();

CREATE TRIGGER mirror_player_provider_snapshot_to_subject_trg AFTER INSERT OR UPDATE ON djm_os.player_provider_stat_snapshots FOR EACH ROW EXECUTE FUNCTION djm_os.mirror_player_provider_snapshot_to_subject();

CREATE TRIGGER mirror_player_scorecard_to_subject_trg AFTER INSERT OR UPDATE ON djm_os.player_scorecards FOR EACH ROW EXECUTE FUNCTION djm_os.mirror_player_scorecard_to_subject();

CREATE TRIGGER trg_sync_official_peer_role_to_player_snapshot AFTER INSERT OR UPDATE OF provider_position ON djm_os.provider_peer_stat_snapshots FOR EACH ROW EXECUTE FUNCTION djm_os.sync_official_peer_role_to_player_snapshot();

CREATE TRIGGER sync_football_subject_from_prospect_trg AFTER INSERT OR UPDATE OF full_name, date_of_birth, nationality, primary_position, current_club, current_league, current_country, current_competition_id, current_season_label, current_season_start, football_provider_ids, stats_url, transfermarkt_url, wyscout_url, canonical_key, external_data_status, external_data_checked_at, external_data_error, signed_player_id, linked_player_id, market_value, market_value_currency, market_value_verified_at ON djm_os.scouting_prospects FOR EACH ROW EXECUTE FUNCTION djm_os.sync_football_subject_from_prospect();

CREATE TRIGGER trg_clean_recruitment_player_name BEFORE INSERT OR UPDATE OF full_name ON djm_os.scouting_prospects FOR EACH ROW EXECUTE FUNCTION djm_os.clean_recruitment_player_name();

CREATE TRIGGER trg_inherit_signed_player_owner AFTER UPDATE OF signed_player_id ON djm_os.scouting_prospects FOR EACH ROW EXECUTE FUNCTION djm_os.inherit_signed_player_owner();

CREATE TRIGGER trg_normalize_transfermarkt_enrichment_status BEFORE INSERT OR UPDATE OF transfermarkt_enrichment_status ON djm_os.scouting_prospects FOR EACH ROW EXECUTE FUNCTION djm_os.normalize_transfermarkt_enrichment_status();

CREATE TRIGGER trg_sync_recruitment_followup_task_title AFTER INSERT OR UPDATE OF full_name ON djm_os.scouting_prospects FOR EACH ROW EXECUTE FUNCTION djm_os.sync_recruitment_followup_task_title();

CREATE TRIGGER trg_tell_djm_permission AFTER INSERT OR UPDATE OF is_active, role_title ON djm_os.team_members FOR EACH ROW EXECUTE FUNCTION djm_os.seed_tell_djm_permission();

CREATE TRIGGER audit_team_access AFTER INSERT OR DELETE OR UPDATE ON admin_allowlist FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_change();

CREATE TRIGGER protect_admin_allowlist BEFORE INSERT OR DELETE OR UPDATE ON admin_allowlist FOR EACH ROW EXECUTE FUNCTION private.protect_admin_allowlist();

CREATE TRIGGER sync_allowlist_profile_role AFTER INSERT OR DELETE OR UPDATE ON admin_allowlist FOR EACH ROW EXECUTE FUNCTION private.sync_allowlist_profile_role();

CREATE TRIGGER admin_notes_updated_at BEFORE UPDATE ON admin_notes FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER stamp_admin_note_author BEFORE INSERT ON admin_notes FOR EACH ROW EXECUTE FUNCTION private.stamp_admin_note_author();

CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER queue_announcement_notifications AFTER INSERT ON announcements FOR EACH ROW EXECUTE FUNCTION private.queue_announcement_notifications();

CREATE TRIGGER career_entries_updated_at BEFORE UPDATE ON career_entries FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER djm_career_score_stale AFTER INSERT OR DELETE OR UPDATE OF minutes, appearances, league, country, competition_id, source_reviewed_at ON career_entries FOR EACH ROW EXECUTE FUNCTION private.djm_career_score_stale_trigger();

CREATE TRIGGER djm_v5_score_stale_career_entries AFTER INSERT OR DELETE OR UPDATE ON career_entries FOR EACH ROW EXECUTE FUNCTION private.djm_v5_mark_player_score_stale_from_input();

CREATE TRIGGER normalize_career_competition_label BEFORE INSERT OR UPDATE OF league ON career_entries FOR EACH ROW EXECUTE FUNCTION private.normalize_career_competition_label();

CREATE TRIGGER protect_career_entry_staff_writes BEFORE INSERT OR DELETE OR UPDATE ON career_entries FOR EACH ROW EXECUTE FUNCTION private.protect_career_entry_staff_writes();

CREATE TRIGGER sync_subject_career_from_player_entry_trg AFTER INSERT OR DELETE OR UPDATE ON career_entries FOR EACH ROW EXECUTE FUNCTION djm_os.sync_subject_career_from_player_entry();

CREATE TRIGGER trg_career_change_requires_review AFTER INSERT OR DELETE OR UPDATE ON career_entries FOR EACH ROW EXECUTE FUNCTION private.career_change_requires_review();

CREATE TRIGGER trg_refresh_public_profile_from_career AFTER INSERT OR DELETE OR UPDATE OF season_label, stats_year, appearances, starts, minutes, goals, assists, source_name, source_url, source_provider, source_reviewed_at, source_synced_at ON career_entries FOR EACH ROW EXECUTE FUNCTION private.djm_refresh_public_profile_from_career();

CREATE TRIGGER audit_club_share_link AFTER INSERT OR UPDATE ON club_share_links FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_change();

CREATE TRIGGER trg_djm_sync_notification_preference_aliases BEFORE INSERT OR UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION private.djm_sync_notification_preference_aliases();

CREATE TRIGGER player_agreements_updated_at BEFORE UPDATE ON player_agreements FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER cv_settings_updated_at BEFORE UPDATE ON player_cv_settings FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER normalize_cv_key_stats BEFORE INSERT OR UPDATE OF key_stats ON player_cv_settings FOR EACH ROW EXECUTE FUNCTION private.normalize_cv_key_stats();

CREATE TRIGGER audit_document_club_share AFTER UPDATE ON player_documents FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_change();

CREATE TRIGGER protect_document_club_share_approval BEFORE INSERT OR UPDATE ON player_documents FOR EACH ROW EXECUTE FUNCTION private.protect_document_club_share_approval();

CREATE TRIGGER trg_prevent_sensitive_player_document_share BEFORE INSERT OR UPDATE OF club_shareable, document_type ON player_documents FOR EACH ROW EXECUTE FUNCTION private.prevent_sensitive_player_document_share();

CREATE TRIGGER player_onboarding_updated_at BEFORE UPDATE ON player_onboarding FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER player_opportunities_updated_at BEFORE UPDATE ON player_opportunities FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER trg_djm_opportunity_event_bridge AFTER INSERT OR UPDATE OF stage, next_action, next_action_due, last_contacted_at ON player_opportunities FOR EACH ROW EXECUTE FUNCTION djm_os.opportunity_event_bridge();

CREATE TRIGGER trg_djm_opportunity_identity_sync AFTER INSERT OR UPDATE OF club_name, country, contact_name, contact_role, owner_id ON player_opportunities FOR EACH ROW EXECUTE FUNCTION djm_os.sync_opportunity_identity_trigger();

CREATE TRIGGER player_private_updated_at BEFORE UPDATE ON player_private FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER trg_djm_player_private_sync AFTER INSERT OR UPDATE OF market_preferences, relocation_preferences, salary_expectation, travel_availability, passports_held, work_rights, preferred_move_timing ON player_private FOR EACH ROW EXECUTE FUNCTION djm_os.sync_player_private_trigger();

CREATE TRIGGER audit_public_profile AFTER INSERT OR UPDATE ON player_public_profiles FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_change();

CREATE TRIGGER enforce_public_profile_publish_rules BEFORE INSERT OR UPDATE ON player_public_profiles FOR EACH ROW EXECUTE FUNCTION private.enforce_public_profile_publish_rules();

CREATE TRIGGER protect_public_profile_admin_fields BEFORE UPDATE ON player_public_profiles FOR EACH ROW EXECUTE FUNCTION private.protect_public_profile_admin_fields();

CREATE TRIGGER public_profiles_updated_at BEFORE UPDATE ON player_public_profiles FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER trg_public_profile_career_timeline BEFORE INSERT OR UPDATE ON player_public_profiles FOR EACH ROW EXECUTE FUNCTION private.set_public_profile_career_timeline();

CREATE TRIGGER protect_player_request_fields BEFORE UPDATE ON player_requests FOR EACH ROW EXECUTE FUNCTION private.protect_player_request_fields();

CREATE TRIGGER queue_admin_inbound_notification AFTER INSERT ON player_requests FOR EACH ROW EXECUTE FUNCTION private.queue_admin_inbound_notification();

CREATE TRIGGER queue_player_request_notification AFTER INSERT ON player_requests FOR EACH ROW EXECUTE FUNCTION private.queue_player_request_notification();

CREATE TRIGGER trg_assign_player_request_owner BEFORE INSERT OR UPDATE OF assigned_to_user_id, created_by, player_id ON player_requests FOR EACH ROW EXECUTE FUNCTION djm_os.assign_player_request_owner();

CREATE TRIGGER player_videos_updated_at BEFORE UPDATE ON player_videos FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER audit_player_verification AFTER UPDATE ON players FOR EACH ROW EXECUTE FUNCTION private.audit_sensitive_change();

CREATE TRIGGER djm_player_competition_score_stale AFTER UPDATE OF current_competition_id, current_league, current_country ON players FOR EACH ROW EXECUTE FUNCTION private.djm_player_competition_score_stale_trigger();

CREATE TRIGGER djm_v5_score_stale_player_identity AFTER UPDATE OF current_club, current_league, primary_position, date_of_birth, verification_status ON players FOR EACH ROW WHEN (old.current_club IS DISTINCT FROM new.current_club OR old.current_league IS DISTINCT FROM new.current_league OR old.primary_position IS DISTINCT FROM new.primary_position OR old.date_of_birth IS DISTINCT FROM new.date_of_birth OR old.verification_status IS DISTINCT FROM new.verification_status) EXECUTE FUNCTION private.djm_v5_mark_player_score_stale_from_player();

CREATE TRIGGER players_updated_at BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER protect_player_admin_fields BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION private.protect_player_admin_fields();

CREATE TRIGGER protect_player_system_fields BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION private.protect_player_system_fields();

CREATE TRIGGER sync_football_subject_from_player_trg AFTER INSERT OR UPDATE OF preferred_name, first_name, last_name, date_of_birth, nationalities, primary_position, current_club, current_league, current_country, current_competition_id, current_season_label, current_season_start, football_provider_ids, stats_url, transfermarkt_url, wyscout_url, transfermarkt_market_value, transfermarkt_market_value_currency, transfermarkt_value_verified_at ON players FOR EACH ROW EXECUTE FUNCTION djm_os.sync_football_subject_from_player();

CREATE TRIGGER trg_detach_retained_football_intelligence_before_player_delete BEFORE DELETE ON players FOR EACH ROW EXECUTE FUNCTION djm_os.detach_retained_football_intelligence_before_player_delete();

CREATE TRIGGER trg_djm_player_market_bridge AFTER UPDATE OF primary_position, secondary_positions, preferred_foot, contract_status, contract_expiry, current_club, current_country, football_status ON players FOR EACH ROW EXECUTE FUNCTION djm_os.player_change_bridge();

CREATE TRIGGER trg_unpublish_dossier_when_verification_is_lost AFTER UPDATE ON players FOR EACH ROW EXECUTE FUNCTION private.unpublish_dossier_when_verification_is_lost();

CREATE TRIGGER trg_validate_player_primary_staff BEFORE INSERT OR UPDATE OF primary_staff_user_id ON players FOR EACH ROW EXECUTE FUNCTION djm_os.validate_player_primary_staff();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER protect_profile_admin_fields BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION private.protect_profile_admin_fields();

CREATE TRIGGER sync_djm_team_membership_after_profile_change AFTER INSERT OR UPDATE OF role, display_name, email ON profiles FOR EACH ROW EXECUTE FUNCTION private.sync_djm_team_membership();

CREATE TRIGGER resources_updated_at BEFORE UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER surface_checkin_signal AFTER INSERT OR UPDATE ON weekly_checkins FOR EACH ROW EXECUTE FUNCTION private.surface_checkin_signal();

commit;
