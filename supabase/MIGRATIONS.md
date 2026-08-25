# Supabase migration history

The live Supabase project remains the canonical production database, but every production migration should also be committed under `supabase/migrations/`.

Current production migration sequence:

1. `20260823150534 build_djm_player_platform_v1`
2. `20260823150700 harden_djm_security_v1`
3. `20260823150742 optimize_djm_rls_and_indexes_v1`
4. `20260823150927 protect_djm_admin_fields_and_auto_player_v1`
5. `20260823151103 expand_public_club_profile_v1`
6. `20260823151533 lock_public_profile_creation_to_admin_v1`
7. `20260823152317 add_secure_player_invites_v1`
8. `20260823160248 expand_djm_command_centre_v2`
9. `20260823160628 lock_invite_table_grants_v2`
10. `20260823160655 separate_sensitive_staff_access_v2`
11. `20260823160923 add_private_resource_library_v2`
12. `20260823161211 protect_agency_action_fields_v2`
13. `20260823161241 publish_cv_visibility_snapshot_v2`
14. `20260823161719 add_player_data_verification_v3`
15. `20260823163440 add_djm_opportunities_agreements_and_tracked_shares_v4`
16. `20260823163900 include_approved_documents_in_club_share_v4`
17. `20260823181940 production_hardening_qa_v3`
18. `20260823182045 enforce_invitation_only_signup_v4`
19. `20260823182509 add_player_inbox_requests_and_career_mobility`
20. `20260823184935 temporary_djm_premium_build_transport` (superseded)
21. `20260823195507 secure_player_initiated_messages`
22. `20260823195540 add_safe_invite_validation`
23. `20260823202704 temporary_build_transport_bucket` (superseded)
24. `20260823204933 align_live_player_form_enums_v2`
25. `20260823205056 lock_and_remove_temporary_build_transport`
26. `20260823205139 hide_private_workflow_tables_from_anon`
27. `20260823205248 enable_safe_player_to_djm_messages`
28. `20260823205304 remove_unused_player_messages_table`
29. `20260823205854 allow_player_inbox_messages`
30. `20260823205925 tighten_player_request_updates`
31. `20260823210009 separate_player_sent_messages_from_player_tasks`
32. `20260823210112 add_verified_external_data_review_layer`
33. `20260823210145 create_atomic_player_invitation`
34. `20260823210343 add_djm_request_templates`
35. `20260823210426 surface_important_player_checkin_signals`
36. `20260823210457 route_checkin_signals_to_djm_attention`
37. `20260823210520 separate_inbound_messages_and_checkin_signals`
38. `20260823210711 optimise_request_and_source_data_policies`
39. `20260823210742 expand_editable_cv_draft_fields`
40. `20260823210902 protect_last_djm_admin`
41. `20260823211851 add_web_push_readiness_v1`
42. `20260823212046 refine_player_inbox_visibility_v1`
43. `20260823212152 add_notification_outbox_v1`
44. `20260823212334 add_web_push_server_config_v1`
45. `20260823212556 remove_anon_support_table_visibility_v1`
46. `20260823212918 enforce_verified_club_profiles_v1`
47. `20260823213140 allow_internal_safety_unpublish_v1`
48. `20260823213459 schedule_weekly_player_push_reminders_v1`
49. `20260823213631 add_document_readiness_metadata_v1`
50. `20260823214006 add_sensitive_action_audit_trail_v1`
51. `20260823214150 push_inbound_player_attention_to_admins_v1`
52. `20260823221734 fix_invited_player_auth_link_protection`
53. `20260824052704 add_onboarding_compatibility_columns`
54. `20260824061857 fix_admin_player_public_upload_policy`
55. `20260824062511 add_admin_managed_photo_select_policy`
56. `20260824074730 sync_career_stats_to_club_profile`
57. `20260824075327 add_stats_provenance_and_public_stats_link`
58. `20260824080431 sync_public_stats_url_from_player`
59. `20260824120256 harden_weekly_checkin_validation_v1`
60. `20260824133918 protect_document_club_share_approval_v1`
61. `20260824134211 fix_document_club_share_guard_execution_context_v1`
62. `20260825085804 add_current_season_tracking`

## Recovery rule

Do not recreate the database from application code and never seed private player data into Git.

Before any major schema change:

1. Make the change through a Supabase migration.
2. Commit the exact SQL migration under `supabase/migrations/`.
3. Run Supabase security and performance advisers.
4. Confirm a clean local database reset can reproduce the schema.
5. Never commit auth users, Storage objects, private VAPID keys, service-role keys, player data, check-ins, salary expectations, travel documents, contracts or admin notes.

## Status

The migrations from `20260823221734` through `20260824120256` were recovered directly from the live Supabase migration history on 24 August 2026.

`20260824120256_harden_weekly_checkin_validation_v1` was applied as part of the production-hardening pass and existing weekly check-in records were successfully validated afterwards.

`20260824133918_protect_document_club_share_approval_v1` added a database-level guard around document club-sharing approval.

`20260824134211_fix_document_club_share_guard_execution_context_v1` corrected the trigger execution-context check and was verified with rollback-only permission tests: players can continue managing normal documents, players cannot approve documents for club sharing, and DJM admins can.

`20260825085804_add_current_season_tracking` added an explicit DJM-managed current season label and start date so player season tracking works correctly across different football calendars.
