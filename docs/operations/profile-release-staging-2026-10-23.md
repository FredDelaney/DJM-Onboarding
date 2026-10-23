# Player Profile and connected-work staging follow-up, 23 October 2026

Subsequent production authorisation, catalog comparison and reviewed release scope: [23 October release manifest](intelligent-agency-release-2026-10-23.md). The production boundary below records the outcome of this earlier staging pass.

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

## Connected-work rollout applied

The previously reviewed migration is `20261022191532_connected_work_and_player_photo_reliability.sql`. Its staging candidate compiled and passed the owned/shared-task canary. The exact existing staging worker differences were checked before promotion: the photo handlers, task approval/subject checks and a semantically equivalent Unicode escape in the player-context helper. No unrelated runtime changes were found.

The migration was applied with its canonical `20261022191532` ledger version in the same transaction as the DDL. The transaction locked the migration ledger, refused an existing version, recorded the exact source, and notified PostgREST to reload its cache. No historical ledger entries were edited. This avoids assigning a different generated timestamp to the already-committed release file.

Both database canaries passed again after installation. Existing task/action fingerprints match before and after migration and the rollback canary; synthetic accounts, invitations and temporary tenants were rolled back. The original profile/player/membership and policy/grant fingerprints also matched across the profile repair. Security advisor findings remain unchanged, excluding observation timestamps.

Release targets retain their current JWT settings:

| Function | Deployed version | JWT verification | Bundle SHA-256 |
| --- | --- | --- | --- |
| `agency-os` | 54 | enabled | `915a3090789d1601cdefb3e1c6bb0cf0db71e2a882819a4db5afa8424b648d61` |
| `redream-ai-process` | 15 | disabled; existing internal checks retained | `cf4f981019c01568b20b6c1233f89161c1651f581217dc7d2deb0273d627ad05` |
| `djm-tell-process` | 25 | disabled; same canonical shared handler | `6f627ad32754f191f968ec33247c419e4aa56ad1ac2ee7b1bde01851b474cedc` |

Each worker was downloaded after deployment and every file in its dependency closure matched the committed source (7, 6 and 6 files respectively, ignoring trailing newlines). Source commit: `dd4625a`. All three live endpoints returned **401** for unauthenticated requests.

## Signed-in browser acceptance and cleanup

The existing staging session opened Home and the Northstar player detail successfully. A clearly named synthetic QA player was created only in Northstar, which is explicitly marked as a synthetic test tenant. Its real signed-in **Verify & publish** action succeeded, showing **Profile is live** and **Live Data verified**. **Unpublish Player Profile** then succeeded, showing **Profile unpublished**. No club message or share link was sent.

Publication proof: `/tmp/redream-staging-acceptance/profile-published.png`. The QA profile was subsequently unpublished and its player archived; Northstar returned to **4 active players** and staging returned to **1 auth identity**. This browser canary retains its normal audit history and archived QA record, unlike the fully rolled-back SQL fixtures.

The live signed-in photo upload **passed** after the user enabled Chrome's extension file-URL permission. The existing repository icon was uploaded only to the clearly labelled synthetic QA player. The UI confirmed **Player photo updated**, the saved image rendered at 512 x 512 after reload, and Storage recorded a 25,469-byte PNG at the tenant/player/actor-scoped path. Exactly one matching `player.photo_updated` audit event was recorded. The canonical player changed from verified to reviewing, cleared `verified_at`, and required review before publication.

The older frontend on the stable staging alias briefly retained its verified badge until reload; after reload it showed **Player data needs review** and **Draft Verification needed**. PR 250 already merges the attachment response's verification fields into the profile state immediately and reloads the canonical bundle, so no additional production code change was needed. Photo replacement and immediate badge behaviour on the PR frontend were not newly accepted by this hosted canary.

Photo proof: `/tmp/redream-staging-acceptance/photo-saved-review-required.png`. The QA player was archived again after testing and remained unpublished. Northstar again has **4 active players**, and staging has **1 auth identity**. Its synthetic image and audit history remain with the archived QA record. No real player photo was changed. No live model call or physical iPhone/Safari test was performed in this follow-up.

## Remaining release boundary

The refreshed staging catalog preflight now reports **29 older missing RPC contracts**, with **zero missing selected columns** and the new photo writer present. These are provider connection/sync/email, connected chat identity/history/reply, player connected activity, semantic email-task completion and team handoff contracts. Their underlying provider tables are missing too; copying function names or replaying the historical range cannot safely reconcile them.

No frontend source changed in this follow-up. The existing required browser suite passed on frontend commit `3f49970`, including 236 screen/viewport combinations and design-system checks. The new profile/database test file and migration are covered by the full 1,952-test local check, with the renamed migration path confirmed by a further 28 focused passing tests. GitHub checks on the updated PR head must still be checked before merging.

**Not cleared for production promotion.** Keep PR 250 in draft until the relevant hosted compatibility gaps and outstanding browser/model canaries are resolved. The completed staging database/worker rollout is not production acceptance.

The provider/OAuth/email/history foundation and team-handoff reconciliation remain separate. Do not replay the historical provider range, run `db push --include-all`, or execute the excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`.
