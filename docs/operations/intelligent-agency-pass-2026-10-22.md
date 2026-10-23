# Connected agency reliability review, 22 October 2026

Base: `ee90b1712644f85663042921e793ddc5b02262eb` (merged PR 249). Work is isolated in `codex/intelligent-agency-pass`. No hosted schema, customer data, secrets or configuration was changed during this review. No manual deployment or external message was sent. Pull-request previews use the existing integration. The existing unsaved staging document was preserved.

## Audit and implemented repairs

The previous platform audit (`platform-audit-2026-10-21.md`) was refreshed against current source, both live schema catalogs, migration ledgers, Edge inventories, advisors and GitHub checks. Migration names and actual contracts were compared; staging bootstrap timestamps are not treated as missing application schema.

| Area | Finding / outcome | Evidence |
| --- | --- | --- |
| Tell ReDream | Structured interpretation, entity resolution, evidence, individual action ledger, approval, deduplication, review dismissal and guarded Undo already exist. Retained. | Existing Tell database, worker, safety and browser suites |
| Shared work | Context and executor were owner-only despite canonical shared responsibility. Added explicit shared-task candidates; colleague work always requires review and approval. | Actual SQL, worker and guard tests, including assignment revocation, private Calendar work, inactive membership, ownership and tenant separation |
| Tasks / colleagues | Active-membership colleague resolver, multiple assignees, All staff and canonical responsibility already exist. No second ownership model introduced. | Existing assignment and responsibility suites; shared work uses those same records |
| Players / recruitment | Identity, sourced statistics, reviewed AI changes, ownership, next steps and communication editors already exist. The photo control called backend actions absent from the handler. Implemented those actions and a narrow confirmed attachment RPC. Reused the control in the player work view. The drawer resets on player/workspace changes so old identity and upload controls cannot carry into a new selection. Manual mobile inspection also exposed Edit controls overlapping the player name; they now use the existing top toolbar, with an explicit non-overlap assertion at four widths. The upload failure check also reproduced a clipped Retry button; the hero no longer clips its recovery popover or relies on the overflowing decorative circle. | Real HTTP handler tests; actual SQL with the player protection trigger; profile and work-view browser uploads |
| Photo integrity | Upload is scoped to tenant/player/actor. Attachment verifies stored object metadata, edit permission, expected previous photo and an audit record. Retry is idempotent. The UI confirms the returned player/path, uses the actual verification state and refreshes publication status without losing drafts. Revoked edit access and newer photos cannot be overwritten. | Permission, conflict, invalid media, missing upload and repeated attachment tests |
| Club / contact / activity | Existing canonical contact editor, missing-number/email entrypoints, linked activity and relationship work retained. Relationship attention signals are labelled as attention, rather than presenting a review status with no approval decision. | Contact/editor/deep-page browser suites; live staging contact navigation at desktop and 390 px |
| Profile / CV | Existing tenant branding, sourced/optional stats, video/Transfermarkt links and share approval retained. Actual rendered PDF revealed a career heading touching the performance chart; added section spacing and corrected singular career-stat wording. | Actual two-page branded PDF rendered and visually inspected; renderer-level spacing and long-pagination tests |
| Communications | Existing OAuth, sync, Meta thread binding, reply drafts and provider recovery retained. Staging lacks several required backend contracts; do not describe fixture coverage as provider acceptance. | Read-only live release preflight below |
| Review states | Existing question, accept/edit, Leave unchanged, failure retry and resolution trigger retained. Shared work enters that existing review path. | Existing Tell browser and database suites plus new worker assertions |
| Loading / errors / mobile | Existing bounded reads, stale selection, drafts, retry, account/tenant cache scope and overlay protections retained. Photo write errors now keep their useful recovery instruction. | Existing critical browser suites and the added photo work-view path at 320/390/768/1440 px |

The existing AI action schema supports task updates/creation, linked interactions, email-task completion, sourced claims, player suggestions/exclusions, scouting observations and club needs. This pass does not claim arbitrary natural-language edits of every player/contact/club field. Important factual changes continue through reviewed, permission-checked existing editors/proposals. Automatic completion remains restricted to a single strongly supported owned objective, including a supported subject (not just the same names and a past-tense verb); ordinary availability/available and profile/dossier paraphrases remain supported. Unknown or missing subjects stay reviewed; attempted/future/negated conversations, signature/payment objectives and ambiguous tasks stay unresolved for review. No extra model call was added. The old former-player example was removed from the runtime prompt and benchmark fixtures in favour of a synthetic player.

## Database manifest

New forward-only migration:

`supabase/migrations/20261022191532_connected_work_and_player_photo_reliability.sql`

- Adds nullable canonical player/prospect links missing in staging and their existing canonical index shapes; no historical record is backfilled or relabelled.
- Replaces `redream_ai_task_context`, `redream_ai_update_task` and the private task Undo helper using existing tasks, Calendar tasks and `platform.work_responsibilities`.
- Adds the private shared-task permission predicate and service-only `platform_server_attach_player_photo`.
- Keeps browser roles denied from privileged task retrieval/mutation and photo attachment. No table grants, role bypass, ownership transfer or broad raw record mutation.
- Repeated application is tested with existing records/actions. The old player verification guard still runs after a photo changes.

Do not run `supabase db push --include-all` against these divergent hosted ledgers. Do not execute the previously excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`. Do not replay healthy staff invitation/tagging repairs; the tagging table and RPCs are now present in both live projects.

## Hosted compatibility: release blockers

Generate the read-only catalog check:

```sh
node scripts/release-database-preflight.mjs > /tmp/redream-release-preflight.sql
```

Run that SQL through an authorised database connection against the intended project. It checks literal RPC calls and declarative RPC route entries in current application/worker source, selected required columns and accidental browser execution of server-only RPCs. It does not test dynamically generated names, argument overloads, runtime provider credentials or workflow success. Zero rows is only this catalog check passing.

Observed before applying this release:

- **Staging `ltvmopvarlnidiozvpow`:** 31 existing missing RPC contracts and three missing canonical links (`captures.prospect_id`, `interactions.player_id`, `interactions.prospect_id`), plus this release's new photo RPC. The migration repairs those three links and supplies the photo RPC; it does not install the unrelated missing provider foundation.
- **Production `xogoigaaskmuspiehkba`:** 11 existing missing RPC contracts, plus this release's new photo RPC. No missing selected columns and no exposed `platform_server_*` execution grants were returned by this focused check. Production lacks the `agency-launch` worker too; source/catalog parity is not established by the frontend build.

Staging missing contracts group into provider OAuth/calendar/contact/email sync, connected reply/history/player activity, semantic email-task completion, team handoff, and profile verification/publication writers. A live staging Connections read also returned the missing `redream_provider_connections()` contract; its UI now uses a plain retry message instead of showing raw database internals. The profile writers are in existing migrations `20261002104000_player_profile_verification_writer_v1.sql` and `20261002105500_player_profile_publish_snapshot_writer_v1.sql`. The provider foundation starts at `20260926122729_redream_provider_connections_v1.sql`, followed by calendar/contact sync and the email/identity/history migrations. These require a separate reviewed reconciliation with the current staging schema; replaying that whole historical range would overwrite already newer functions and is unsafe.

Production's existing missing RPC calls are:

- `platform_server_can_deliver_tenant_notification`
- `platform_server_create_player_portal_invite`
- `platform_server_email_tenant_context`
- `platform_server_owner_create_first_opportunity`
- `platform_server_owner_create_first_player`
- `platform_server_owner_create_first_relationship`
- `platform_server_owner_launch_workspace`
- `platform_server_owner_update_branding`
- `platform_server_player_stats_freshness_rows`
- `platform_server_public_demo_snapshot_v1`
- `platform_server_recoverable_invite_auth_user`

Some call sites belong to source workers not deployed to production. Each must be reconciled with its intended release surface; do not create permissive fallback wrappers to conceal the mismatch. Advisor warnings about authenticated security-definer functions and password protection remain separate security review items; their presence is not proof of an exploit, and no configuration was changed blindly.

## Deployment order and acceptance

1. Review this migration, reconcile the existing catalog blockers and rerun the read-only preflight on staging.
2. Apply only the reviewed forward migration to staging, with canonical migration tracking. Exercise owned/shared tasks, review/Undo, revocation and photo upload/attach against actual hosted services.
3. Deploy `agency-os`, `redream-ai-process` and compatibility `djm-tell-process` from the same reviewed commit. Both processing entrypoints share `_shared/ai-process.ts`, `task-work.ts`, `ai-safety.ts`, `ai-router.ts` and the existing preparation helpers. Preserve JWT settings: `agency-os` uses `verify_jwt=true`; both Tell processing entrypoints use `verify_jwt=false` and retain their internal authentication/permission checks.
4. Deploy the frontend preview from that exact commit; verify actual profile/edit/photo/PDF, Tell receipt, personal Home, shared assignment and mobile navigation.
5. Production promotion requires explicit authorisation and successful staging acceptance. Do not promote the frontend alone and assume the backend is ready.

Frontend rollback uses the previous READY deployment; the additive migration and ledger remain. Reverting shared-task worker handling restores the previous owner-only behaviour. Do not delete canonical work, tags, activity, uploaded photos or historical actions as rollback. Photo attachment always requires its narrow server RPC.

## Validation

Baseline: 1,926 unit tests passed. The first full browser run intermittently failed on the tagging compatibility assertion. A later CI failure reported an empty alert; a rendered-page diagnostic confirmed it was Next.js's `__next-route-announcer__`, outside the application main, with no application error. The assertion now checks the actual profile main and additionally verifies that unavailable tagging cannot offer an unusable editor. Tagging persistence, conflicts, stale selection, permissions and recovery checks remain. The final changed photo/workspace journey was rerun after the last UI fix and passed.

Local validation is deliberately separated from hosted acceptance. No live AI/provider call, external message, physical iPhone/Safari upload or customer data mutation was used to make a passing claim. Staging profile publication/provider linking cannot be accepted while the catalog gaps above remain.

Final local results:

- `npm run check`: passed, including the repository lint equivalent (`check:no-em-dash`), 1,945 unit/database/worker/renderer tests on Next.js 16.4.2, all typecheck projects, production build and bundle check.
- `npm run check:browser`: passed the full critical suite before the framework security patch. The required `browser_journeys` check on the final patched PR head is the full-suite acceptance for Next.js 16.4.2; verify that exact head before merging. The final photo/workspace test was then rerun with long-name non-overlap, full Retry hit-testing, confirmed verification, a wrong-player response, retry without re-upload and a held new-player request; all passed at the relevant 320/390/768/1440 widths.
- The final Connections browser regression also passed: a missing schema contract hides setup controls, shows a plain retry message, exposes no raw function error and preserves the existing expired-permission/workspace recovery paths.
- Workspace entry gzip: **143,747 / 150,000 bytes** on Next.js 16.4.2.
- Actual branded club PDF: both pages rendered and inspected; long-story pagination/footer tests and the real chart-to-career spacing test passed. Singular career-stat wording is verified through the renderer.
- Read-only catalog preflight executed against both hosted projects; the compatibility review items above remain. No new migration or worker was deployed.

Verdict: code changes are ready for review. **Not cleared for production promotion** until the hosted compatibility gaps relevant to this release are reconciled and the new migration/workers pass a real staging canary. Browser fixtures and mocked model/provider responses establish code behaviour, not live model accuracy, OAuth/Meta account acceptance or physical iPhone/Safari behaviour.

## Framework security gate

The first PR verification job failed its existing production dependency audit: Next.js 16.3.8 is covered by the newly indexed upstream advisories [image optimisation](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions denial of service](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) and [typed-array cache deserialisation](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr). Next.js is pinned to 16.4.2 with its matching lockfile; `sharp` resolves to 0.35.5. `npm audit --omit=dev --audit-level=high` returns zero vulnerabilities. No audit gate was disabled.

The new native-module checksum happened to contain the product category token, exposing a false positive in the existing language test. The guard now omits only opaque lockfile `integrity` values, and a regression proves readable lockfile metadata and other JSON are still checked. The product language assertion remains in place.

The first full browser job on Next.js 16.4.2 exposed a test-selector compatibility issue: production CSS module classes no longer include source filenames. The header was present, but the old filename-dependent selector could not find it. Header, Network toolbar and Home metadata checks now use retained local names and existing semantic markers; header readiness is explicit. A production-build regression across agency, player and settings screens passed 12 mobile screen/viewport combinations, including the safe-area, navigation, focus and PDF/CSP assertions. No geometry or permission assertion was removed. The final required full browser job remains the release gate for the exact PR head.

A subsequent full CI run passed those journeys and reached the complete screen matrix. Its only four reported failures were service-review contrast checks with an empty target list. The saved report and screenshot confirmed the summary was present; its selector still required a CSS filename. That check now scopes the local hero class to the existing accessible Player Service Review region, waits for the summary and retains the 4.5 contrast threshold at all four widths. Missing content has its own failure message.

The corrected production-build review check passed at 320, 390, 768 and 1440 px, measuring 5.07 contrast for both summary labels. The final design-system browser suite also passed, including feedback semantics/contrast, pending saves and retained drafts after failed saves.
