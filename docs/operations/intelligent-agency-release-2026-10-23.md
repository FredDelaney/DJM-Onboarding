# Intelligent agency release manifest, 23 October 2026

The user authorised continuing through production release after validation. This manifest narrows the earlier staging gate using a fresh production comparison. Actual rollout results belong in PR 250's release record; this file is the reviewed plan, not evidence that a deployment occurred.

## Scope and targets

- Repository: `FredDelaney/DJM-Onboarding`, PR 250, base `main`.
- Staging database: `ltvmopvarlnidiozvpow` (DJM Platform Staging).
- Production database: `xogoigaaskmuspiehkba` (DJM Onboard).
- Vercel team: `team_UQsuBTYTtkklLpT9lJ3llVNQ`.
- ReDream production: `redream-systems`, `prj_x29nbgEDWaW6hOw8F5mK7jgq18Xv`.
- Existing DJM application: `djm-player`, `prj_VjUR9esINumuWk1YGsQATg2kywCp`.
- ReDream staging: `redream-systems-staging`, `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`.

Apply only these exact reviewed migrations, preserving their canonical ledger versions:

1. `20261022191532_connected_work_and_player_photo_reliability.sql`
2. `20261023075343_restore_profile_release_writers_v1.sql`
3. `20261023092411_lock_profile_publication_player_v1.sql`

Production already has both profile writers. The second migration deliberately preserves existing writers and their guards. The third upgrades only the reviewed publisher body to lock the canonical player until snapshot publication finishes, preventing concurrent photo/football changes from publishing stale verification. It preserves the already-locked staging implementation, retains existing execute grants and refuses unknown writer drift. A real database regression verifies the old read lacks the lock and the repaired publication holds it. The existing production task context/update/Undo bodies match their canonical 20 October parent migration. Retain current data, table grants and RLS policies. Bound lock acquisition and apply each migration with its canonical ledger entry in the same transaction; refuse an existing entry rather than replaying it.

Deploy only `agency-os`, `redream-ai-process` and compatibility `djm-tell-process`, with their exact recursive source dependencies from the reviewed commit. Keep JWT verification enabled for `agency-os` and disabled for the two processing workers, which retain their internal authentication checks.

The production `agency-os` dependency already exposes `source_acceptance_method` with assigned staff football evidence. Preserve that provenance field in the repository's explicit football allowlist, with a regression assertion that internal notes and commission data remain excluded. All other downloaded worker differences are the reviewed photo/shared-task changes.

## Existing catalog drift and release decision

Every one of the 29 older contracts missing on staging is present in production. They remain staging parity work, not absent production dependencies for this release.

Production's focused catalog check returns the new photo writer plus the same 11 older missing contracts recorded in the 22 October audit: notification delivery, player invitation, email tenant context, owner launch/branding, weekly stats freshness, public demo and invitation recovery. Their call sites already exist on `main`; this PR introduces none of those calls. It adds no launch, invite, email-dispatch, notification, public-demo or weekly-refresh worker deployment. Do not replay their historical migrations or deploy those source workers as part of this release. The existing branding contract is not used by the changed photo/Tell paths.

This is acceptance of the changed photo, profile and owned/shared task workflows, not a claim that the entire static catalog, provider onboarding or all historic workers are production ready. No browser-executable server-only RPC or missing selected column was returned by the production preflight.

## Release gates

- Focused regression tests, typecheck, full CI verification and browser journeys must pass on the final reviewed source. Never bypass required checks or branch protections.
- Accept the actual staging frontend photo upload/replacement and immediate verification-state update, plus one live Tell processing canary. Preserve approval, ownership, duplicate/revocation and Undo database coverage.
- Apply the three production migrations only after staging acceptance, then verify their actual function contracts, privileges, ledger and advisor delta before deploying workers.
- Download all three deployed workers and compare their recursive files to the reviewed source; check unauthenticated requests still return 401.
- Merge the tested head, verify the resulting production deployment commit/aliases and perform read-only signed-in production smoke checks. Do not mutate customer records for acceptance.

## Rollback and retained limitations

Production baseline is `ee90b1712644f85663042921e793ddc5b02262eb`.

- ReDream frontend rollback: `dpl_4tiXVsrpDiSxyN7AVi7bD3oVM3EQ`.
- DJM frontend rollback: `dpl_DQ3XxPFrgRRuZXyngnWxno9asyd3`.
- Captured original production worker versions: `agency-os` 42, `redream-ai-process` 24, `djm-tell-process` 25. Preserve their source bundles before replacement.

Frontend/worker rollback must not delete additive database schema, task actions, assignments, player photos or migration history. A previous owner-only worker may be restored if task processing regresses. Preserve production-only provenance while restoring worker source.

Do not execute `20260930142119_restore_redream_relationship_person_entrypoint.sql`, use `db push --include-all`, change secrets or Supabase configuration, send external messages, or interpret this release as live provider OAuth/email or physical iPhone/Safari acceptance. Existing advisor findings remain a separate reviewed backlog.
