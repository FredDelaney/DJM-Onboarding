# Player teams and personal Home

Staff can choose a player team in the existing player workspace and internal profile. Owners, admins and the existing primary staff member can save tags. Selected people receive player updates, birthdays and dated reminders in My work. All staff is a persistent agency-wide choice and includes future active staff. Existing primary staff assignments remain the fallback until a team is explicitly saved.

Tags control attention, not record access. They do not change Players directory visibility, player-private RLS, primary ownership or club/public exports. A tagged person can review a reminder without receiving completion or reassignment rights. Home shows direct Review links where those existing rights are absent. Explicit task/reminder responsibility overrides player teams. Personal Calendar task privacy is preserved.

Tasks reuse the established multi-person responsibility system. The existing picker now offers All staff to select current active agency members together. The existing limit of 50 explicit people per task is enforced visibly. Personal tasks remain private; choose Company for shared work.

My work is the Home default. Owners/admins can switch to Agency overview over the existing authorised Home feed; it is not an exhaustive work register. Empty player teams reach admin triage. Relevance is confirmed by a single batched RPC over record references before the final five Home items are ranked. Failed or stale checks never show a stale agency-wide feed as personal work. Retry is available. Existing feed source limits remain in place.

## Release manifest

Apply `20261021182616_player_staff_tags_and_personal_home.sql` before deploying this frontend. It adds the RLS-protected, RPC-only `platform.player_staff_tags` table, `redream_player_staff_tags_v1`, `redream_home_relevance_v1`, and private relevance/edit-right helpers. RPCs validate active staff and selected tenant, reject outsiders and stale revisions, and audit tag changes. No Edge Function, secret or provider configuration changes are needed.

No hosted migration or deployment was performed for this implementation. The excluded relationship migration was not executed. Rollback the frontend first; retain the additive table and saved assignments.

## Verification

Local PGlite executes the migration and validates persistence, current-lead compatibility, selected/all/future staff, explicit responsibility precedence, private tasks, readonly tagged reminders, admin triage, cross-tenant/anonymous/player denials, direct-table protection and concurrent-edit conflicts. Browser fixtures exercise the real components/coordinator with deterministic API responses: selected/all staff, persistence, conflicts, old-player response rejection, personal Home filtering, overview switching, retry and stale-response rejection at mobile/desktop widths. They use synthetic data, not production accounts.

Local validation passed: 1,924 tests; TypeScript including the existing fixture projects; production build; workspace entry 146,695 gzip bytes against its 150,000 budget. Browser checks passed for player-team persistence/conflict/race cases, personal Home/readonly reminders/overview/retry, existing responsibility and Home completion/Undo flows, eleven Player Profile scenarios and Calendar task lifecycle/12 viewport checks. Mobile screenshots were inspected in `/tmp/redream-staff-tags-proof/`. Hosted migration and staging acceptance remain a release gate.
