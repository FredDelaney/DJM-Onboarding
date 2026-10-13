# Calendar workspace verification, 4 October 2026

Release status: feature branch prepared for review. Production migration, merge and deployment are not authorised by the previous calendar release approval.

## Result

The calendar combines owner-private personal tasks, tenant-shared company tasks, existing meetings/follow-ups/agency dates and optional birthday categories. It retains Month/Agenda, date navigation, meeting briefs and outcome actions. New tasks support create/edit/reschedule, complete/reopen and reversible archive/restore, including No date. Confirmed writes update task collections and Today immediately; failed refreshes retain confirmed state. Revision conflicts retain drafts and refresh canonical rows for reopening. Inactive company owners require reassignment on edit, including unchanged ownership.

## Verification

- Fresh `npm run check` after the review fixes: 1,447 tests passed, zero failures, Next type generation/TypeScript and optimised production build passed.
- PGlite tests execute the real migrations with different actors/roles: owner-only personal reads (including admin denial), company staff reads and mutation rights, tenant/player/anonymous/direct-table denial, revisions, assignees, immutable visibility, idempotency, metadata-only audit, archive/restore, pagination and DST guards.
- Real Chromium fixture checks: create, assignment, edit, genuine competing revision, retained drafts, refreshed inactive-owner options, complete/reopen, archive/restore, reschedule and confirmed updates despite failed reads; No date, preferences, birthday copy, source retry, tenant change, independent Today, unsaved close confirmation and DST rejection. Month/Agenda had no document overflow at 320/375/390/430/768/1440 px, no page errors and 44px month date targets.
- The browser fixture was temporarily mounted outside production routing. It is not part of this PR's deployed routes; the committed browser driver currently requires that external fixture and is not self-contained on a fresh checkout.
- Staging `ltvmopvarlnidiozvpow`: both additive migrations applied. Real authenticated create/complete/reopen/archive/restore, stale revision rejection, foreign tenant rejection and repeated DST time rejection passed in a rolled-back SQL smoke. Zero tasks persisted. Authenticated direct-table access and anonymous RPC execution are denied. The follow-up resulting-owner guard was confirmed installed.
- Staging security advisor warnings include intentional authenticated security-definer RPC exposure; each new RPC enforces actor and tenant checks. Existing unrelated advisor warnings are not changed by this release.

Staging has one Auth account, so a real two-user/admin rehearsal remains unverified. Cross-user/privacy evidence comes from PGlite, not a live multi-user staging session. Fixture checks do not prove signed-in production behaviour or production deployment.

## Independent review

Fresh read-only whole-branch review on gpt-6-astra found no Critical findings and three Important findings. Each was reproduced before its fix; the full check and expanded browser checks passed afterwards. No second review was substituted for regression verification.

Deferred minors: agenda navigation can reload unrelated sources; the browser fixture is not committed with its driver. Their costs are extra requests/updating indicators and less reproducible fresh-checkout UI QA.

## Release sequence

After explicit production approval: apply migrations in order (`20261004125332_calendar_workspace_tasks_v1.sql`, then `20261004134529_calendar_task_owner_edit_guard.sql`), merge the reviewed PR and verify the resulting deployment. Rehearse a real multi-user staging allow/deny check when another authorised account is available. Preserve the feature worktree for review feedback.
