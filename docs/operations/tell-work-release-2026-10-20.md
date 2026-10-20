# Tell ReDream work and reliability release

## Starting point

Production `app.djmsports.com` and `redreamsystems.com` were verified serving `9ae8ade` (PR #244). Its loading, overlay, navigation and financial fixes are preserved. Open PRs #174, #199, #201 and #231 were identified; none was merged over newer work.

The stable ReDream staging alias was still serving `6c9cbfd` (PR #241). Its ignored-build command accepted only `saas/tenant-foundation`. The validated current main was built on the staging project using a deployment-specific `exit 1` ignored-build override. This does not change the customer-facing project.

Five already-deployed task-assignment/vocabulary migrations and the deployed worker's colleague-choice/shared-responsibility implementation were missing from Git. Their source is recovered in this branch. Existing production/staging equivalents must not be reapplied blindly. The deployment record's migration names are the authoritative comparison when historical timestamps differ between environments.

## Behaviour

- Tell ReDream can complete, reopen and reschedule the speaker's existing agency and Calendar tasks. Meetings are unaffected.
- One existing interpretation call receives at most 80 authorised owned task candidates, including recently completed work for reopening. Relative dates use notification preferences, with the existing Europe/Rome fallback.
- Matching considers objective, person/player/club, ownership and lifecycle. Clear, high-confidence, non-commercial completions can save automatically with Undo. Other valid task changes remain proposals. Ambiguity produces task choices; a selected choice still requires approval.
- Future, attempted, negated and conditional work cannot establish completion. A discussion does not establish a signature, payment, acceptance or reply. Supplied outcomes, waiting states and blockers can be saved as notes while unfinished work stays open.
- Task changes, notes, needs and new follow-ups stay in one capture. Exact overlapping follow-ups are suppressed. Capture upload idempotency is unchanged. Retries reuse the saved plan and skip applied, undone and dismissed action hashes.
- Approval isolates failures per action. Successful writes remain saved; only failed actions retry. Undo compares the complete saved task snapshot and refuses to overwrite later changes.
- Receipts use actual action statuses, rather than the model summary, and expose record links and Undo after success. Supporting evidence is expandable. Review items provide edit and/or Leave unchanged; dismissing the last unresolved action closes its action-review item.
- Colleague choices use active staff memberships separately from player/contact resolution. Existing shared responsibility is preserved. A colleague's task is not silently completed by another speaker.
- Ask ReDream can open an editable task brief. It never submits or approves that brief automatically.
- Unsent typed captures recover after refresh/reopening within the same tab. Drafts are scoped by authenticated actor, workspace and record context, expire after two hours, clear on successful durable submission and disappear from the screen on sign-out. Blocked browser storage does not prevent normal capture.
- Staff invitation reads have deadlines and Retry. Password/name requirements explain disabled registration. Acceptance opens the exact invited workspace; wrong-account recovery remains available.
- Google/Microsoft status uses the returned connection state, with one relevant recovery action. Failed reads cannot display an empty disconnected state, and late responses cannot cross workspaces. Provider authorisation and actual sync remain separate from configuration-screen access.

## Deployment manifest

New database migrations, in order:

1. `20261020162412_tell_redream_task_updates.sql`
2. `20261020164842_close_resolved_capture_reviews.sql`

The first adds narrowly granted task-context, action-state, task-update and dismissal APIs, extends approval and Undo while preserving the deployed email/ownership behaviour, and keeps dismissed actions final. The second closes only resolved `tell_djm_action_review` rows through a private trigger. There is no new data table or raw browser table grant.

Functions:

- `redream-ai-process/index.ts`
- `djm-tell-process/index.ts` (compatibility)
- Both include `_shared/ai-process.ts`, `ai-router.ts`, `ai-safety.ts` and `task-work.ts`. Preserve `verify_jwt=false`: the handlers validate cron/user authentication and per-capture access themselves.
- `redream-document-assist/index.ts`, with `_shared/document-assist.ts` and `ai-router.ts`. Preserve `verify_jwt=true`, owner/admin checks and usage authorisation. This previously merged function was absent from production. It uses the existing server-side OpenAI configuration and writes usage telemetry only.

The real document-assistance canary exposed a status-contract defect: the function sent `success` to the usage ledger, which accepts `succeeded`. This release corrects the status, constrains model field keys per document type, and records failure-stage diagnostics without document wording. A subsequent authorised staging request produced four sourced suggestions and missing-information questions, with a successful 3,676 ms usage event. No document or roster row was saved by that request.

Order: migrations, worker functions, document-assistance function, then frontend. Validate staging before the corresponding production steps. Merge only the exact PR head with successful `verify` and `browser_journeys` checks. Confirm the merged SHA, READY states and serving aliases afterwards. No secrets or Supabase project configuration changes are required.

## Validation

Focused domain, actual PostgreSQL/PGlite and worker-handler tests cover objective matching, ambiguity, permission/lifecycle denial, timezone handling, completion plus follow-up, stale snapshots, duplicate retries, partial failure, Calendar dates, guarded Undo, dismissal and review closure. The model is mocked in automated tests; no tenant AI credits are spent by those tests.

Browser fixtures cover the invitation journey, truthful mixed-action receipts, reviewed choices, failed-action retry, dismissal, Undo, Ask-to-task handoff, provider states and stale workspace reads. Widths include 320, 390, 768 and 1440 pixels. All writes use synthetic intercepted APIs. The established profile/document/overlay and core-workspace suites remain in CI. These are simulated mobile checks, not physical iPhone/Safari acceptance.

The first hosted staging database canary verified completion, duplicate retry, context scope, API grants and Undo in a rolled-back synthetic transaction. Staging security advisors reported no new notices. Hosted function/provider requests and final deployment identities must be verified in the release report; a successful build alone is insufficient.

The actual reported Alex invitation is not identifiable from the brief. Its exact historical failure is not claimed reproduced; the concrete disabled-button and load-recovery problems were reproduced with synthetic invitations. Individual provider account reconnection, real email delivery and physical-device permission flows remain account/device acceptance checks.
