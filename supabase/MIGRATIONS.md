# Supabase migration history

The production Supabase project is currently the canonical migration source until the GitHub/Codex connection is enabled. Do not recreate the database from application code or seed private player data into Git.

Current production migration sequence:

1. `build_djm_player_platform_v1`
2. `harden_djm_security_v1`
3. `optimize_djm_rls_and_indexes_v1`
4. `protect_djm_admin_fields_and_auto_player_v1`
5. `expand_public_club_profile_v1`
6. `lock_public_profile_creation_to_admin_v1`
7. `add_secure_player_invites_v1`
8. `expand_djm_command_centre_v2`
9. `lock_invite_table_grants_v2`
10. `separate_sensitive_staff_access_v2`
11. `add_private_resource_library_v2`
12. `protect_agency_action_fields_v2`
13. `publish_cv_visibility_snapshot_v2`
14. `add_player_data_verification_v3`
15. `add_djm_opportunities_agreements_and_tracked_shares_v4`
16. `include_approved_documents_in_club_share_v4`
17. `production_hardening_qa_v3`
18. `enforce_invitation_only_signup_v4`
19. `add_player_inbox_requests_and_career_mobility`
20. `temporary_djm_premium_build_transport` *(superseded/locked down)*
21. `secure_player_initiated_messages`
22. `add_safe_invite_validation`
23. `temporary_build_transport_bucket` *(superseded/locked down)*
24. `align_live_player_form_enums_v2`
25. `lock_and_remove_temporary_build_transport`
26. `hide_private_workflow_tables_from_anon`
27. `enable_safe_player_to_djm_messages`
28. `remove_unused_player_messages_table`
29. `allow_player_inbox_messages`
30. `tighten_player_request_updates`
31. `separate_player_sent_messages_from_player_tasks`
32. `add_verified_external_data_review_layer`
33. `create_atomic_player_invitation`
34. `add_djm_request_templates`
35. `surface_important_player_checkin_signals`
36. `route_checkin_signals_to_djm_attention`
37. `separate_inbound_messages_and_checkin_signals`
38. `optimise_request_and_source_data_policies`
39. `expand_editable_cv_draft_fields`
40. `protect_last_djm_admin`
41. `add_web_push_readiness_v1`
42. `refine_player_inbox_visibility_v1`
43. `add_notification_outbox_v1`
44. `add_web_push_server_config_v1`
45. `remove_anon_support_table_visibility_v1`
46. `enforce_verified_club_profiles_v1`
47. `allow_internal_safety_unpublish_v1`
48. `schedule_weekly_player_push_reminders_v1`
49. `add_document_readiness_metadata_v1`
50. `add_sensitive_action_audit_trail_v1`
51. `push_inbound_player_attention_to_admins_v1`

## Before first GitHub-backed database deployment

Export the remote schema/migrations with the Supabase CLI from a trusted laptop environment, commit the generated SQL under `supabase/migrations/`, and confirm a clean local reset can reproduce the schema. Never commit auth users, Storage objects, private VAPID keys, service-role keys, player data, check-ins, salary expectations, passports, contracts or admin notes.
