create index if not exists change_observations_reviewed_by_idx on djm_os.change_observations(reviewed_by);
create index if not exists claims_verified_by_idx on djm_os.claims(verified_by);
create index if not exists entity_resolution_resolved_by_idx on djm_os.entity_resolution_queue(resolved_by);
create index if not exists import_batches_submitted_by_idx on djm_os.import_batches(submitted_by);
create index if not exists import_rows_person_idx on djm_os.import_rows(person_id);
create index if not exists import_rows_org_idx on djm_os.import_rows(organisation_id);
create index if not exists merge_candidates_resolved_by_idx on djm_os.merge_candidates(resolved_by);
create index if not exists notifications_person_idx on djm_os.notifications(person_id);
create index if not exists notifications_org_idx on djm_os.notifications(organisation_id);
create index if not exists notifications_player_idx on djm_os.notifications(player_id);
create index if not exists notifications_need_idx on djm_os.notifications(club_need_id);
create index if not exists notifications_task_idx on djm_os.notifications(task_id);
create index if not exists opportunity_links_linked_by_idx on djm_os.opportunity_links(linked_by);
create index if not exists relationship_snapshots_person_idx on djm_os.relationship_snapshots(person_id);
create index if not exists review_items_player_idx on djm_os.review_items(player_id);
create index if not exists review_items_need_idx on djm_os.review_items(club_need_id);
create index if not exists scouting_prospects_linked_player_idx on djm_os.scouting_prospects(linked_player_id);
create index if not exists scouting_reports_scout_idx on djm_os.scouting_reports(scout_user_id);
create index if not exists scouting_watchlist_entries_added_by_idx on djm_os.scouting_watchlist_entries(added_by);
create index if not exists scouting_watchlists_owner_idx on djm_os.scouting_watchlists(owner_user_id);

drop policy if exists djm_team_insert on djm_os.channel_connections;
drop policy if exists djm_team_update on djm_os.channel_connections;
drop policy if exists djm_team_delete on djm_os.channel_connections;
create policy djm_team_insert on djm_os.channel_connections for insert to authenticated with check ((select djm_os.is_team_member()) and user_id=(select auth.uid()));
create policy djm_team_update on djm_os.channel_connections for update to authenticated using ((select djm_os.is_team_member()) and user_id=(select auth.uid())) with check ((select djm_os.is_team_member()) and user_id=(select auth.uid()));
create policy djm_team_delete on djm_os.channel_connections for delete to authenticated using ((select djm_os.is_team_member()) and user_id=(select auth.uid()));

drop policy if exists djm_team_insert on djm_os.conversation_threads;
drop policy if exists djm_team_update on djm_os.conversation_threads;
drop policy if exists djm_team_delete on djm_os.conversation_threads;
create policy djm_team_insert on djm_os.conversation_threads for insert to authenticated with check ((select djm_os.is_team_member()) and owner_user_id=(select auth.uid()));
create policy djm_team_update on djm_os.conversation_threads for update to authenticated using ((select djm_os.is_team_member()) and owner_user_id=(select auth.uid())) with check ((select djm_os.is_team_member()) and owner_user_id=(select auth.uid()));
create policy djm_team_delete on djm_os.conversation_threads for delete to authenticated using ((select djm_os.is_team_member()) and owner_user_id=(select auth.uid()));

drop policy if exists djm_team_insert on djm_os.messages;
drop policy if exists djm_team_update on djm_os.messages;
drop policy if exists djm_team_delete on djm_os.messages;
create policy djm_team_insert on djm_os.messages for insert to authenticated with check ((select djm_os.is_team_member()) and exists(select 1 from djm_os.conversation_threads t where t.id=thread_id and t.owner_user_id=(select auth.uid())));
create policy djm_team_update on djm_os.messages for update to authenticated using ((select djm_os.is_team_member()) and exists(select 1 from djm_os.conversation_threads t where t.id=thread_id and t.owner_user_id=(select auth.uid()))) with check ((select djm_os.is_team_member()) and exists(select 1 from djm_os.conversation_threads t where t.id=thread_id and t.owner_user_id=(select auth.uid())));
create policy djm_team_delete on djm_os.messages for delete to authenticated using ((select djm_os.is_team_member()) and exists(select 1 from djm_os.conversation_threads t where t.id=thread_id and t.owner_user_id=(select auth.uid())));

drop policy if exists djm_notification_select on djm_os.notifications;
drop policy if exists djm_notification_update on djm_os.notifications;
create policy djm_notification_select on djm_os.notifications for select to authenticated using ((select djm_os.is_team_member()) and user_id=(select auth.uid()));
create policy djm_notification_update on djm_os.notifications for update to authenticated using ((select djm_os.is_team_member()) and user_id=(select auth.uid())) with check ((select djm_os.is_team_member()) and user_id=(select auth.uid()));
notify pgrst,'reload schema';
