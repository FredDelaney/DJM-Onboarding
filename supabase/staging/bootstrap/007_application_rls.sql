-- DJM Player staging RLS bootstrap
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after all private, djm_os and public function bootstrap batches.
--
-- Exact current-production RLS state for the application schemas:
--   109 tables with RLS enabled
--   287 policies
-- Production body MD5: d04feef3532bb174434158b4d6e4a88a
--
-- Policies depend on recovered private/djm_os helper functions, so this file
-- intentionally comes after all function batches.

begin;
set local search_path = public, extensions;

ALTER TABLE djm_os.automation_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_select ON djm_os.automation_incidents AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.automation_incidents AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.booking_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.booking_profiles AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.booking_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.booking_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.booking_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.booking_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.booking_requests AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.booking_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.booking_requests AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.booking_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.calendar_connections AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.calendar_connections AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.calendar_connections AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.calendar_connections AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.captures AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.captures AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.captures AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.captures AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY tell_djm_capture_delete_restrict ON djm_os.captures AS RESTRICTIVE FOR DELETE TO authenticated USING (((processing_version IS DISTINCT FROM 'tell_djm_v1'::text) OR (submitted_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

CREATE POLICY tell_djm_capture_insert_restrict ON djm_os.captures AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((processing_version IS DISTINCT FROM 'tell_djm_v1'::text) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.is_enabled = true))))) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

CREATE POLICY tell_djm_capture_select_restrict ON djm_os.captures AS RESTRICTIVE FOR SELECT TO authenticated USING (((processing_version IS DISTINCT FROM 'tell_djm_v1'::text) OR (submitted_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

CREATE POLICY tell_djm_capture_update_restrict ON djm_os.captures AS RESTRICTIVE FOR UPDATE TO authenticated USING (((processing_version IS DISTINCT FROM 'tell_djm_v1'::text) OR (submitted_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true)))))) WITH CHECK (((processing_version IS DISTINCT FROM 'tell_djm_v1'::text) OR (submitted_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

ALTER TABLE djm_os.change_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.change_observations AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.change_observations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.change_observations AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.change_observations AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.channel_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.channel_connections AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT djm_os.is_team_member() AS is_team_member) AND (user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY djm_team_insert ON djm_os.channel_connections AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT djm_os.is_team_member() AS is_team_member) AND (user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY djm_team_select ON djm_os.channel_connections AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.channel_connections AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT djm_os.is_team_member() AS is_team_member) AND (user_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT djm_os.is_team_member() AS is_team_member) AND (user_id = ( SELECT auth.uid() AS uid))));

ALTER TABLE djm_os.claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.claims AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.claims AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.claims AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.claims AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.club_needs ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.club_needs AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.club_needs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.club_needs AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.club_needs AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.competitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.competitions AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.competitions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.competitions AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.competitions AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.contact_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.contact_methods AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.contact_methods AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.contact_methods AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.contact_methods AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.conversation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.conversation_threads AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT djm_os.is_team_member() AS is_team_member) AND (owner_user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY djm_team_insert ON djm_os.conversation_threads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT djm_os.is_team_member() AS is_team_member) AND (owner_user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY djm_team_select ON djm_os.conversation_threads AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.conversation_threads AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT djm_os.is_team_member() AS is_team_member) AND (owner_user_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT djm_os.is_team_member() AS is_team_member) AND (owner_user_id = ( SELECT auth.uid() AS uid))));

ALTER TABLE djm_os.country_league_strength_anchors ENABLE ROW LEVEL SECURITY;

ALTER TABLE djm_os.deal_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_deal_rooms_all ON djm_os.deal_rooms AS PERMISSIVE FOR ALL TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.employments ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.employments AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.employments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.employments AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.employments AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DJM staff add entity links" ON djm_os.entity_links AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (djm_os.is_team_member());

CREATE POLICY "DJM staff delete entity links" ON djm_os.entity_links AS PERMISSIVE FOR DELETE TO authenticated USING (djm_os.is_team_member());

CREATE POLICY "DJM staff read entity links" ON djm_os.entity_links AS PERMISSIVE FOR SELECT TO authenticated USING (djm_os.is_team_member());

CREATE POLICY "DJM staff update entity links" ON djm_os.entity_links AS PERMISSIVE FOR UPDATE TO authenticated USING (djm_os.is_team_member()) WITH CHECK (djm_os.is_team_member());

ALTER TABLE djm_os.entity_resolution_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.entity_resolution_queue AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.entity_resolution_queue AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.entity_resolution_queue AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.entity_resolution_queue AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.events AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.events AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.events AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.external_identity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.external_identity_links AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.external_identity_links AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.external_identity_links AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.external_identity_links AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.football_fixtures ENABLE ROW LEVEL SECURITY;

CREATE POLICY football_fixtures_team_select ON djm_os.football_fixtures AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.football_intelligence_enrichment_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE djm_os.football_subject_career_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE djm_os.football_subject_identity_evidence ENABLE ROW LEVEL SECURITY;

ALTER TABLE djm_os.football_subject_match_snapshots ENABLE ROW LEVEL SECURITY;

ALTER TABLE djm_os.football_team_strength_snapshots ENABLE ROW LEVEL SECURITY;

ALTER TABLE djm_os.football_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY football_teams_team_select ON djm_os.football_teams AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.freshness_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.freshness_queue AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.freshness_queue AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.freshness_queue AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.freshness_queue AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.global_league_strength_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE djm_os.home_item_controls ENABLE ROW LEVEL SECURITY;

ALTER TABLE djm_os.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.import_batches AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.import_batches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.import_batches AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.import_batches AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.import_rows AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.import_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.import_rows AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.import_rows AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.interactions AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.interactions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.interactions AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.interactions AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.league_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DJM staff add league benchmarks" ON djm_os.league_benchmarks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (djm_os.is_team_member());

CREATE POLICY "DJM staff delete league benchmarks" ON djm_os.league_benchmarks AS PERMISSIVE FOR DELETE TO authenticated USING (djm_os.is_team_member());

CREATE POLICY "DJM staff read league benchmarks" ON djm_os.league_benchmarks AS PERMISSIVE FOR SELECT TO authenticated USING (djm_os.is_team_member());

CREATE POLICY "DJM staff update league benchmarks" ON djm_os.league_benchmarks AS PERMISSIVE FOR UPDATE TO authenticated USING (djm_os.is_team_member()) WITH CHECK (djm_os.is_team_member());

ALTER TABLE djm_os.market_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_market_signals_all ON djm_os.market_signals AS PERMISSIVE FOR ALL TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.meetings AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.meetings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.meetings AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.meetings AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_memories_all ON djm_os.memories AS PERMISSIVE FOR ALL TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.merge_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.merge_candidates AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.merge_candidates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.merge_candidates AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.merge_candidates AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.messages AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT djm_os.is_team_member() AS is_team_member) AND (EXISTS ( SELECT 1
   FROM djm_os.conversation_threads t
  WHERE ((t.id = messages.thread_id) AND (t.owner_user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY djm_team_insert ON djm_os.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT djm_os.is_team_member() AS is_team_member) AND (EXISTS ( SELECT 1
   FROM djm_os.conversation_threads t
  WHERE ((t.id = messages.thread_id) AND (t.owner_user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY djm_team_select ON djm_os.messages AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT djm_os.is_team_member() AS is_team_member) AND (EXISTS ( SELECT 1
   FROM djm_os.conversation_threads t
  WHERE (t.id = messages.thread_id)))));

CREATE POLICY djm_team_update ON djm_os.messages AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT djm_os.is_team_member() AS is_team_member) AND (EXISTS ( SELECT 1
   FROM djm_os.conversation_threads t
  WHERE ((t.id = messages.thread_id) AND (t.owner_user_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((( SELECT djm_os.is_team_member() AS is_team_member) AND (EXISTS ( SELECT 1
   FROM djm_os.conversation_threads t
  WHERE ((t.id = messages.thread_id) AND (t.owner_user_id = ( SELECT auth.uid() AS uid)))))));

ALTER TABLE djm_os.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_notification_select ON djm_os.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT djm_os.is_team_member() AS is_team_member) AND (user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY djm_notification_update ON djm_os.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT djm_os.is_team_member() AS is_team_member) AND (user_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT djm_os.is_team_member() AS is_team_member) AND (user_id = ( SELECT auth.uid() AS uid))));

ALTER TABLE djm_os.opportunity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.opportunity_links AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.opportunity_links AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.opportunity_links AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.opportunity_links AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.organisations AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.organisations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.organisations AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.organisations AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.people AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.people AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.people AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.people AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.player_canonical_stat_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_canonical_stat_snapshots_team_select ON djm_os.player_canonical_stat_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.player_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.player_evidence AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.player_evidence AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.player_evidence AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.player_evidence AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.player_market_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_select ON djm_os.player_market_facts AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM djm_os.team_members tm
  WHERE ((tm.user_id = ( SELECT auth.uid() AS uid)) AND tm.is_active))));

ALTER TABLE djm_os.player_match_stat_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_match_stat_snapshots_team_select ON djm_os.player_match_stat_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.player_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.player_matches AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.player_matches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.player_matches AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.player_matches AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.player_performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.player_performance_snapshots AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.player_performance_snapshots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.player_performance_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.player_performance_snapshots AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.player_projection_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_projection_snapshots_team_select ON djm_os.player_projection_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.player_provider_stat_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_provider_stat_snapshots_team_delete ON djm_os.player_provider_stat_snapshots AS PERMISSIVE FOR DELETE TO authenticated USING (djm_os.is_team_member());

CREATE POLICY player_provider_stat_snapshots_team_insert ON djm_os.player_provider_stat_snapshots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (djm_os.is_team_member());

CREATE POLICY player_provider_stat_snapshots_team_select ON djm_os.player_provider_stat_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (djm_os.is_team_member());

CREATE POLICY player_provider_stat_snapshots_team_update ON djm_os.player_provider_stat_snapshots AS PERMISSIVE FOR UPDATE TO authenticated USING (djm_os.is_team_member()) WITH CHECK (djm_os.is_team_member());

ALTER TABLE djm_os.player_score_json_imports ENABLE ROW LEVEL SECURITY;

ALTER TABLE djm_os.player_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DJM staff add player scorecards" ON djm_os.player_scorecards AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (djm_os.is_team_member());

CREATE POLICY "DJM staff read player scorecards" ON djm_os.player_scorecards AS PERMISSIVE FOR SELECT TO authenticated USING (djm_os.is_team_member());

CREATE POLICY "DJM staff update player scorecards" ON djm_os.player_scorecards AS PERMISSIVE FOR UPDATE TO authenticated USING (djm_os.is_team_member()) WITH CHECK (djm_os.is_team_member());

ALTER TABLE djm_os.player_similarity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_similarity_snapshots_team_select ON djm_os.player_similarity_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.provider_peer_stat_snapshots ENABLE ROW LEVEL SECURITY;

ALTER TABLE djm_os.provider_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_sync_runs_team_select ON djm_os.provider_sync_runs AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.recruitment_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY recruitment_interactions_team_all ON djm_os.recruitment_interactions AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM djm_os.team_members tm
  WHERE ((tm.user_id = ( SELECT auth.uid() AS uid)) AND tm.is_active)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM djm_os.team_members tm
  WHERE ((tm.user_id = ( SELECT auth.uid() AS uid)) AND tm.is_active))));

ALTER TABLE djm_os.relationship_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_relationship_edges_all ON djm_os.relationship_edges AS PERMISSIVE FOR ALL TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.relationship_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.relationship_snapshots AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.relationship_snapshots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.relationship_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.relationship_snapshots AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.relationships AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.relationships AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.relationships AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.relationships AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.review_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.review_items AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.review_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.review_items AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.review_items AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.scheduler_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_select ON djm_os.scheduler_status AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.scouting_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.scouting_prospects AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.scouting_prospects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.scouting_prospects AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.scouting_prospects AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.scouting_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.scouting_reports AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.scouting_reports AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.scouting_reports AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.scouting_reports AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.scouting_watchlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.scouting_watchlist_entries AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.scouting_watchlist_entries AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.scouting_watchlist_entries AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.scouting_watchlist_entries AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.scouting_watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.scouting_watchlists AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.scouting_watchlists AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.scouting_watchlists AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.scouting_watchlists AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.source_monitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_source_monitors_all ON djm_os.source_monitors AS PERMISSIVE FOR ALL TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.source_trust ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.source_trust AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.source_trust AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.source_trust AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.source_trust AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.suggestions AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.suggestions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.suggestions AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.suggestions AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.system_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_select ON djm_os.system_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.tasks AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.tasks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.tasks AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.tasks AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY djm_team_delete ON djm_os.team_members AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_insert ON djm_os.team_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_select ON djm_os.team_members AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

CREATE POLICY djm_team_update ON djm_os.team_members AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member)) WITH CHECK (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.tell_djm_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tell_djm_actions_select ON djm_os.tell_djm_actions AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM djm_os.captures c
  WHERE ((c.id = tell_djm_actions.capture_id) AND (c.submitted_by = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

CREATE POLICY tell_djm_actions_update ON djm_os.tell_djm_actions AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM djm_os.captures c
  WHERE ((c.id = tell_djm_actions.capture_id) AND (c.submitted_by = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM djm_os.captures c
  WHERE ((c.id = tell_djm_actions.capture_id) AND (c.submitted_by = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

ALTER TABLE djm_os.tell_djm_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY tell_djm_aliases_insert ON djm_os.tell_djm_aliases AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((owner_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

CREATE POLICY tell_djm_aliases_select ON djm_os.tell_djm_aliases AS PERMISSIVE FOR SELECT TO authenticated USING (((owner_user_id = ( SELECT auth.uid() AS uid)) OR (owner_user_id IS NULL) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

CREATE POLICY tell_djm_aliases_update ON djm_os.tell_djm_aliases AS PERMISSIVE FOR UPDATE TO authenticated USING (((owner_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true)))))) WITH CHECK (((owner_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

ALTER TABLE djm_os.tell_djm_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tell_djm_permissions_select ON djm_os.tell_djm_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.tell_djm_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tell_djm_questions_select ON djm_os.tell_djm_questions AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM djm_os.captures c
  WHERE ((c.id = tell_djm_questions.capture_id) AND (c.submitted_by = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

CREATE POLICY tell_djm_questions_update ON djm_os.tell_djm_questions AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM djm_os.captures c
  WHERE ((c.id = tell_djm_questions.capture_id) AND (c.submitted_by = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM djm_os.captures c
  WHERE ((c.id = tell_djm_questions.capture_id) AND (c.submitted_by = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM djm_os.tell_djm_permissions p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.permission_scope = 'full'::text) AND (p.is_enabled = true))))));

ALTER TABLE djm_os.tell_djm_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tell_djm_settings_select ON djm_os.tell_djm_settings AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT djm_os.is_team_member() AS is_team_member));

ALTER TABLE djm_os.timeline_hidden_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY timeline_hidden_items_team_all ON djm_os.timeline_hidden_items AS PERMISSIVE FOR ALL TO authenticated USING (djm_os.is_team_member()) WITH CHECK (djm_os.is_team_member());

ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage allowlist" ON public.admin_allowlist AS PERMISSIVE FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin notes admin only" ON public.admin_notes AS PERMISSIVE FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins delete announcements" ON public.announcements AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "admins insert announcements" ON public.announcements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.is_admin());

CREATE POLICY "admins update announcements" ON public.announcements AS PERMISSIVE FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "players read announcements" ON public.announcements AS PERMISSIVE FOR SELECT TO authenticated USING (((published = true) AND (starts_at <= now()) AND ((ends_at IS NULL) OR (ends_at >= now())) AND ((target_player_id IS NULL) OR private.can_view_player(target_player_id))));

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read audit" ON public.audit_events AS PERMISSIVE FOR SELECT TO authenticated USING (private.is_admin());

ALTER TABLE public.calendar_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own calendar subscription" ON public.calendar_subscriptions AS PERMISSIVE FOR ALL TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin())) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));

ALTER TABLE public.career_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "career entries delete" ON public.career_entries AS PERMISSIVE FOR DELETE TO authenticated USING (private.can_staff_edit_player(player_id));

CREATE POLICY "career entries insert" ON public.career_entries AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.can_staff_edit_player(player_id));

CREATE POLICY "career entries update" ON public.career_entries AS PERMISSIVE FOR UPDATE TO authenticated USING (private.can_staff_edit_player(player_id)) WITH CHECK (private.can_staff_edit_player(player_id));

CREATE POLICY "career entries view" ON public.career_entries AS PERMISSIVE FOR SELECT TO authenticated USING (private.can_view_player(player_id));

ALTER TABLE public.club_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage club share links" ON public.club_share_links AS PERMISSIVE FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

ALTER TABLE public.club_share_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view club share events" ON public.club_share_views AS PERMISSIVE FOR SELECT TO authenticated USING (private.is_admin());

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own notification preferences" ON public.notification_preferences AS PERMISSIVE FOR ALL TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin())) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));

ALTER TABLE public.player_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins delete agreements" ON public.player_agreements AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "admins insert agreements" ON public.player_agreements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.is_admin());

CREATE POLICY "admins update agreements" ON public.player_agreements AS PERMISSIVE FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "agreements view" ON public.player_agreements AS PERMISSIVE FOR SELECT TO authenticated USING ((private.is_admin() OR (visible_to_player AND (EXISTS ( SELECT 1
   FROM players p
  WHERE ((p.id = player_agreements.player_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))));

ALTER TABLE public.player_cv_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv settings delete" ON public.player_cv_settings AS PERMISSIVE FOR DELETE TO authenticated USING (private.can_edit_player(player_id));

CREATE POLICY "cv settings insert" ON public.player_cv_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "cv settings update" ON public.player_cv_settings AS PERMISSIVE FOR UPDATE TO authenticated USING (private.can_edit_player(player_id)) WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "cv settings view" ON public.player_cv_settings AS PERMISSIVE FOR SELECT TO authenticated USING (private.can_view_player(player_id));

ALTER TABLE public.player_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents delete" ON public.player_documents AS PERMISSIVE FOR DELETE TO authenticated USING (private.can_edit_player(player_id));

CREATE POLICY "documents insert" ON public.player_documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "documents update" ON public.player_documents AS PERMISSIVE FOR UPDATE TO authenticated USING (private.can_edit_player(player_id)) WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "documents view" ON public.player_documents AS PERMISSIVE FOR SELECT TO authenticated USING (private.can_view_sensitive_player(player_id));

ALTER TABLE public.player_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins delete invites" ON public.player_invites AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "admins insert invites" ON public.player_invites AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.is_admin());

CREATE POLICY "admins read invites" ON public.player_invites AS PERMISSIVE FOR SELECT TO authenticated USING (private.is_admin());

CREATE POLICY "admins update invites" ON public.player_invites AS PERMISSIVE FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

ALTER TABLE public.player_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding delete" ON public.player_onboarding AS PERMISSIVE FOR DELETE TO authenticated USING (private.can_edit_player(player_id));

CREATE POLICY "onboarding insert" ON public.player_onboarding AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "onboarding update" ON public.player_onboarding AS PERMISSIVE FOR UPDATE TO authenticated USING (private.can_edit_player(player_id)) WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "onboarding view" ON public.player_onboarding AS PERMISSIVE FOR SELECT TO authenticated USING (private.can_view_player(player_id));

ALTER TABLE public.player_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff delete opportunities" ON public.player_opportunities AS PERMISSIVE FOR DELETE TO authenticated USING (private.can_staff_edit_player(player_id));

CREATE POLICY "staff insert opportunities" ON public.player_opportunities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.can_staff_edit_player(player_id));

CREATE POLICY "staff update opportunities" ON public.player_opportunities AS PERMISSIVE FOR UPDATE TO authenticated USING (private.can_staff_edit_player(player_id)) WITH CHECK (private.can_staff_edit_player(player_id));

CREATE POLICY "staff view opportunities" ON public.player_opportunities AS PERMISSIVE FOR SELECT TO authenticated USING (private.can_staff_view_player(player_id));

ALTER TABLE public.player_privacy_acceptances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.player_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player private delete" ON public.player_private AS PERMISSIVE FOR DELETE TO authenticated USING (private.can_edit_player(player_id));

CREATE POLICY "player private insert" ON public.player_private AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "player private update" ON public.player_private AS PERMISSIVE FOR UPDATE TO authenticated USING (private.can_edit_player(player_id)) WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "player private view" ON public.player_private AS PERMISSIVE FOR SELECT TO authenticated USING (private.can_view_sensitive_player(player_id));

ALTER TABLE public.player_public_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins delete public profiles" ON public.player_public_profiles AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "admins insert public profiles" ON public.player_public_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.is_admin());

CREATE POLICY "admins update public profiles" ON public.player_public_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "public profiles authenticated read" ON public.player_public_profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((((published = true) AND private.player_is_currently_verified(player_id)) OR private.can_view_player(player_id)));

CREATE POLICY "public profiles published anon" ON public.player_public_profiles AS PERMISSIVE FOR SELECT TO anon USING (((published = true) AND private.player_is_currently_verified(player_id)));

ALTER TABLE public.player_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins delete requests" ON public.player_requests AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "requests insert" ON public.player_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((private.is_admin() OR ((request_type = 'message'::text) AND (status = 'open'::text) AND (due_at IS NULL) AND (created_by IS NULL) AND (completed_at IS NULL) AND (message IS NULL) AND (player_reply IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM players p
  WHERE ((p.id = player_requests.player_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "requests update" ON public.player_requests AS PERMISSIVE FOR UPDATE TO authenticated USING ((private.is_admin() OR ((request_type <> ALL (ARRAY['message'::text, 'signal'::text])) AND private.can_view_sensitive_player(player_id)))) WITH CHECK ((private.is_admin() OR ((request_type <> ALL (ARRAY['message'::text, 'signal'::text])) AND private.can_view_sensitive_player(player_id))));

CREATE POLICY "requests view" ON public.player_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((private.is_admin() OR ((request_type <> 'signal'::text) AND private.can_view_sensitive_player(player_id))));

ALTER TABLE public.player_source_refreshes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage source refreshes" ON public.player_source_refreshes AS PERMISSIVE FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

ALTER TABLE public.player_source_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage source suggestions" ON public.player_source_suggestions AS PERMISSIVE FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

ALTER TABLE public.player_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "videos delete" ON public.player_videos AS PERMISSIVE FOR DELETE TO authenticated USING (private.can_edit_player(player_id));

CREATE POLICY "videos insert" ON public.player_videos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "videos update" ON public.player_videos AS PERMISSIVE FOR UPDATE TO authenticated USING (private.can_edit_player(player_id)) WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "videos view" ON public.player_videos AS PERMISSIVE FOR SELECT TO authenticated USING (private.can_view_player(player_id));

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins create players" ON public.players AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.is_admin());

CREATE POLICY "admins delete players" ON public.players AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "players and staff update player" ON public.players AS PERMISSIVE FOR UPDATE TO authenticated USING (private.can_edit_player(id)) WITH CHECK (private.can_edit_player(id));

CREATE POLICY "players and staff view player" ON public.players AS PERMISSIVE FOR SELECT TO authenticated USING (private.can_view_player(id));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));

CREATE POLICY "users update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR private.is_admin())) WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin())) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));

ALTER TABLE public.request_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage request templates" ON public.request_templates AS PERMISSIVE FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins delete resources" ON public.resources AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "admins insert resources" ON public.resources AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.is_admin());

CREATE POLICY "admins update resources" ON public.resources AS PERMISSIVE FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "players read resources" ON public.resources AS PERMISSIVE FOR SELECT TO authenticated USING ((((published = true) AND (audience = ANY (ARRAY['players'::text, 'all'::text]))) OR private.is_admin()));

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins delete site content" ON public.site_content AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "admins insert site content" ON public.site_content AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.is_admin());

CREATE POLICY "admins update site content" ON public.site_content AS PERMISSIVE FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "site content readable" ON public.site_content AS PERMISSIVE FOR SELECT TO anon, authenticated USING (((published = true) OR private.is_admin()));

ALTER TABLE public.staff_player_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins delete staff access" ON public.staff_player_access AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "admins insert staff access" ON public.staff_player_access AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.is_admin());

CREATE POLICY "admins update staff access" ON public.staff_player_access AS PERMISSIVE FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "staff can read own access" ON public.staff_player_access AS PERMISSIVE FOR SELECT TO authenticated USING (((staff_user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));

ALTER TABLE public.weekly_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkins delete" ON public.weekly_checkins AS PERMISSIVE FOR DELETE TO authenticated USING (private.can_edit_player(player_id));

CREATE POLICY "checkins insert" ON public.weekly_checkins AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "checkins update" ON public.weekly_checkins AS PERMISSIVE FOR UPDATE TO authenticated USING (private.can_edit_player(player_id)) WITH CHECK (private.can_edit_player(player_id));

CREATE POLICY "checkins view" ON public.weekly_checkins AS PERMISSIVE FOR SELECT TO authenticated USING (private.can_view_player(player_id));

commit;
