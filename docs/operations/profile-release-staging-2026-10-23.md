# Player Profile and connected-work staging follow-up, 23 October 2026

Target: **DJM Platform Staging**, `ltvmopvarlnidiozvpow`. Production `xogoigaaskmuspiehkba` is untouched. Continue draft PR 250; do not promote it to production while the remaining hosted contracts are unresolved.

## Profile repair applied

Migration: `20261023075343_restore_profile_release_writers_v1.sql`.

The source file version matches the actual staging migration ledger. The initial uncommitted CLI-generated filename was aligned to that recorded version before committing. No historical migration was renamed or replayed.

- Restore only missing `platform_server_confirm_player_profile_verification(uuid,uuid,uuid,text)` and `platform_server_publish_player_profile_snapshot(uuid,uuid,uuid,jsonb)`.
- Reuse the existing 2 October implementations and their narrow trigger modes. Upgrade only the known 24 September guards or the already-canonical guard; unknown guard drift aborts the transaction. Existing writer implementations are preserved.
- Verification rechecks an agent/operations user's current edit assignment. Owners/admins retain agency-wide authority. Publication retains its owner/admin boundary and locks the canonical player row before reading verified facts.
- Neither browser role can execute either writer. No table grants or RLS policies change. Existing player/profile/membership and policy/grant fingerprints match before and after installation.
- Security advisor findings are unchanged when observation timestamps are excluded. Existing findings remain a separate reviewed backlog.

## Validation

- `npm run check` passed: **1,952 tests**, all typecheck projects, production build and bundle budget (143,747 / 150,000 gzip bytes).
- Seven new PGlite tests exercise actual guards and writers: successful canonical publication/branding/audit, revoked assignment and tenant isolation, missing/unverified/unsupported data, browser execution denial, stale-verification invalidation, repeat application/newer writer preservation and atomic refusal of an unknown guard.
- `tests/fixtures/profile-release-staging-verification.sql` passed on real staging both before installation inside a candidate transaction and after installation. Synthetic records and all test changes rolled back.
- Staging has one active staff identity. The profile canary uses it in sequential roles in a newly created synthetic tenant; existing memberships are untouched. This is database acceptance, not physical multi-user browser acceptance.
- The connected-work rollback canary also passed against the candidate migration: owned completion, explicitly shared work, required approval, duplicate retry, unchanged ownership, revoked responsibility and guarded Undo.
- Test setup follows the real staff-invite auth guard and canonical team activation helper. It sets the normal Tell processing version and full permission for the synthetic tenant. No guard was disabled, no privacy acceptance was fabricated and no email/model call was sent.

Both SQL fixtures include their own transaction and rollback. Do not remove the rollback or use customer records as fixtures.

## Connected-work rollout

The previously reviewed migration is `20261022191532_connected_work_and_player_photo_reliability.sql`. Its staging candidate compiled and passed the owned/shared-task canary. The exact existing staging worker differences were checked before promotion: the photo handlers, task approval/subject checks and a semantically equivalent Unicode escape in the player-context helper. No unrelated runtime changes were found.

Release targets retain their current JWT settings:

| Function | JWT verification |
| --- | --- |
| `agency-os` | enabled |
| `redream-ai-process` | disabled; existing internal checks retained |
| `djm-tell-process` | disabled; same canonical shared handler |

The provider/OAuth/email/history foundation and team-handoff reconciliation remain separate. Do not replay the historical provider range, run `db push --include-all`, or execute the excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`.
