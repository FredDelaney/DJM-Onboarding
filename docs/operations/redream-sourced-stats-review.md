# Approval-first sourced statistics review

Scope: PLY-03 of the authoritative ReDream programme. Branch `codex/redream-sourced-player-review`, stacked on PR 256. Production remains unchanged. No provider credentials, schedules, authentication configuration or legacy migrations change.

## Behaviour

The previous deployed statistics worker v12 wrote new career figures before an agent could review them. Its source matched the repository exactly (entry SHA-256 `3b73429fd7e8880fa48ca805b720268e0b403053f84fa08942c59aa05a8b04df`). The actual career trigger then requested verification and unpublished the profile.

The worker now stages suggestions in `player_source_refreshes` with provider `agency_stats_proposal_v1` and status `needs_review`. The server captures actual recorded figures, the row revision, player/season context, supported proposed values and two surfaced independent source hosts. Unknowns remain unknown; zero is retained. No canonical statistics, player verification or publication changes while pending or rejected. One pending review is retained per player; identical rejected evidence is not reopened. Stale research conflicts rather than taking a newer baseline after research.

The existing profile statistics panel presents recorded/suggested figures, actual period/club/competition, check time and sources. Accept, edit and reject use a server-only transaction with trusted actor/tenant and existing assignment enforcement. Editing reuses the existing form, fixes the proposal context and requires explicit source confirmation. Accept/edit retain the existing career verification/unpublication controls; they never verify or publish the player automatically or relabel a parent club as its reserve side. Resolved receipts are repeat-safe; uncertain responses recover by reading status without repeating the decision. Conflicts preserve the draft.

The existing `djm_os.review_items` queue is populated/resolved in the same transaction. A new source proposal is protected from browser insert/update/delete/truncate and has an additional restrictive tenant/operator read policy; older refresh workflows keep their existing policy. Server responses project only review fields, never career notes, commercial data, model prompts or audit internals. Whole Home/Calendar propagation and other material-change types are not accepted by these tests.

## Exact staging rollout manifest

1. Migrations, in order: `20261024114808_approval_first_player_stats_review_v1.sql`, then `20261024120738_scope_stats_review_policy_without_platform_grants_v1.sql`. The second policy migration uses a bounded boolean permission function so browser sessions retain zero access to the platform schema/tables. New helper/guard functions, two guarded triggers, a narrow restrictive policy/index, and three service-only RPCs. No backfill, canonical-row rewrite or migration replay. Confirm new names are absent, active schema contracts and security/performance baseline, then apply only this reviewed source with bounded lock/statement timeouts. Normalize a generated migration ledger version only after matching the exact applied source and confirming the canonical version is absent.
2. `refresh-player-stats-ai-worker/index.ts` plus its shared `football-data/player-data-workflow.ts`; retain current JWT and cron-secret authentication. Database RPCs must exist first. Preserve actual previous source as rollback evidence.
3. `agency-os/index.ts` plus its existing relative dependencies; retain JWT authentication. The new review write uses the existing football assignment/edit gate. Scouts/non-editors do not receive proposal DTOs. Deploy the same shared workflow module as the worker.
4. Frontend built from the reviewed exact commit to staging project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`; inspect READY/source/project before assigning only `redream-systems-staging-jesseedge10-8415s-projects.vercel.app`. No production alias or project changes. Public profile worker is unchanged.

Rollout status: both migrations are installed on staging under canonical versions. Worker 14 and agency-os 58 are ACTIVE; retrieved file contents exactly match reviewed bundles and JWT remains enabled. Final code source `ab01dd45d8ba5f766cb254793244e9a759166a81` is READY as `dpl_HLvLJv8xayYWNm4UPgN2viGKQc2n`, URL `redream-systems-staging-ayrtq5v2j-jesseedge10-8415s-projects.vercel.app`, and is assigned only to the canonical staging alias. The alias was re-read to verify project/source/READY state. This includes the repeated-rejection freshness follow-up. Worker unauthenticated requests remain HTTP 401. Production is unchanged.

| Migration | Source SHA-256 | Exact applied wrapper MD5 |
| --- | --- | --- |
| 20261024114808 | 027cc28b8de2bd6358968e4c60bd33719e78a14fad4d3d2f96c649eacb8b0b29 | 0357c58a2c54cd536b798f099bbedb03 |
| 20261024120738 | e9d2ce7bb0a6b9a15e3e39904f5090825fafd702832897c63c12a0877344cf6f | d8d7f6b4793634e1a2f1a5c7b95c34b7 |

Installed RPC bodies: stage `2fca2b2b3d85a35579937fe76e4edf31`, review-status `e8b956c0e93205487979ce1c829de67b`, decision `8508b092763275715f0b4032ee317c4f`. All are postgres-owned, empty-search-path and service-only. Private read predicate body `3d7a818fb7ccf6008390db756fc0849c` exposes only a permission boolean; final restrictive policy expression MD5 `d2aae9f9b32c4b1c503093206596d671`.

Live privilege inspection found authenticated sessions deliberately have no platform schema usage or tenant/membership SELECT. The second migration routes the policy through a bounded boolean function; tests now enforce those same missing grants, tenant/role/assignment checks and no privilege expansion. Actual staging authenticated-role reads and mutation denials pass, including a spoofed claim-role check. Security and performance advisor findings match the pre-change baseline, excluding observation timestamps.

Validation: full `npm run check` passes 2,024 tests, all TypeScript projects, production build and bundle limits (workspace gzip 143,989 / 150,000). Actual worker/agency HTTP handlers, real PostgreSQL and the responsive browser suite pass. GitHub exact-head CI remains pending; prior PR 256 full CI passed. No external-provider acceptance is inferred from mock or synthetic source evidence.

## Acceptance and cleanup

Use an isolated, explicitly labelled Northstar staging player created by the real agency writer. Record original player hashes and expected fixture dependencies. Prove the real installed RPCs preserve canonical/public data while pending/rejected, enforce actor/tenant/browser grants, and reject stale baseline/context. Browser-test actual proposal comparison, edit/source confirmation, accept/reject, verification separation and responsive layout. Reuse synthetic source evidence only with explicit QA labels; a seeded proposal does not prove a paid provider lookup. No real club or email sends.

Unpublish any canary before removal. Remove only exact QA ID/tenant/name/no-user fixtures with dependency guards and compare baseline hashes. Preserve audit records; never claim zero footprint. Required physical iPhone, independent-agency and external-provider acceptance remains open.

## Recovery

Immediate previous frontend: `dpl_ETr2dV4B5f9X8JA8E867niyzc4YY`, code `ebb7e612deefec04a1db4cf2462ef5442d644754`, which has the same comparison/decision UI before the rejected-check history message. Earlier PR 256 baseline: `dpl_HPmFJBAcHXzDmeQrTN7n7cwjqEaK`, code `28bcc0791d4ae05f5551a5aee82328cc5489cb29`. If reverting the UI, keep guarded proposal records intact and preserve the approval-first backend. Do not restore the old automatic-writing worker as an unreviewed rollback. Prefer a scoped fix forward; proposals can remain pending without changing customer facts. Do not drop guards, clear ledgers, republish or rewrite customer rows to recover. A rollback must retain actual function definitions and ACLs and must not replay historical migrations.

## Completed isolated fixture and cleanup

Northstar D1 player `6864e942-bcf4-4dcb-9ffe-936a97a2bdaa`, review `cb4e5945-e041-4ad5-b39a-40e4df2da66f`, career row `6556518f-d6f0-4188-a247-5e1415ea698f`, creation event `d7a692cc-f44e-469b-96c5-c60f0e550b5f`. Explicit QA name `[QA] Sourced Review 2026-10-24-D1`; no portal user. The real creator, verification and publisher produced a verified/published baseline of 8 appearances; a separate sourced proposal holds 9. Source pages are deliberately synthetic QA evidence, not a paid provider acceptance. Original seven-player full-row JSON hash remains `6e9392dc6b3dc877bfb90c47aeedbb93`. Actual 390px hosted UI rejection retained verified/published 8. The next suggestion of 10 was edited to 7 using the existing form; missing source confirmation correctly blocked the first submission, and zero/unknown remained 0/null. Its saved correction required verification and unpublished the old snapshot. Normal UI verification did not republish it. A third suggestion of 8 was accepted through the UI and again required verification, with no automatic publication. Three corresponding review-work rows resolved and three trusted-actor before/after audits were recorded. Anonymous public reads returned `{data:null}` after the edit/acceptance.

Guarded cleanup removed this exact disposable player, profile, career/proposal rows and only its three resolved QA review-work rows. All seven original players match `6e9392dc6b3dc877bfb90c47aeedbb93`. The creation event and three decision audits are retained. The final browser roster has the original four Northstar players; the removed slug remains unavailable. Rollback-only installed-RPC assertions also proved stale baseline denial, idempotent acceptance, source projection without the private sentinel, queue resolution and publication separation. No production data or configuration changed.

Mobile comparison proof: `/tmp/redream-platform-programme/staging-sourced-review-390.png`. Scripts and logs: `/tmp/redream-platform-programme/sourced-review-*`. The final follow-up also records repeated identical rejected evidence as `rejected` with no fresh timestamp; a successful research response must not relabel rejected figures as fresh canonical evidence.

## Remaining programme work

Exact-head GitHub CI is pending; no merge or production release is implied. PLY-03 remains active for other material-change types and cross-surface resolution. Next inspect the deployed personal Home command contract and reuse the existing low-priority review group for pending statistics suggestions, with canonical tenant/assignment scope and direct profile review links. Ordinary task completion must never accept, verify or publish a player. Continue TELL-05 whole-loop acceptance afterwards. Physical iPhone/Safari, independent real agency, provider and the rest of the 46-item/17-surface matrix remain open in the authoritative plan.
