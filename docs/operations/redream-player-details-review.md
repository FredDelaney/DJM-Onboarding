# Sourced player-details review: UI and Home continuation

Branch `codex/redream-player-details-review`, draft PR 259, stacked on PR 258. Locally validated and deployed on staging; the disposable hosted canary is in progress. A narrow conflict-message follow-up is checked locally and awaits its matching staging worker/frontend. No merge or production release is included.

## Behaviour and boundaries

The current Player Profile has one persistent field-comparison editor, reused by profile preparation. It compares recorded and suggested values, links each field's evidence, supports accept/correct/keep recorded and leaves undecided fields pending. Corrections are typed dates, nationality lists, height, foot or the existing football fields. Original suggestions/sources remain immutable; applied corrections retain actor and value. Research claims, stable request UUIDs, bounded calls, non-overlapping polling and read-only recovery avoid duplicate research/writes. Conflicts preserve drafts and reload the current record. A saved decision followed by failed parent reload labels stale data, blocks sharing and offers Reload player details. Status/recovery does not silently generate a profile.

The existing quiet personal Home group receives a minimal sourced-details item with a direct same-workspace profile anchor. Generic task/feedback controls cannot decide fields; ordinary business work remains admitted. Verification and publication stay separate. Assigned editors use a narrow trusted capability; private profile controls remain restricted. Backend permission uses active canonical agency membership and player edit assignment without adding a global DJM-team prerequisite. Existing Home's legacy global team prerequisite is still open under SAS-04; independent-agency RPC tests do not establish independent-agency Home acceptance.

Reuses `player_source_refreshes` and `player_source_suggestions`; no parallel queue/canonical record. Thirteen allowlisted fields require their own surfaced sources. Names guard identity rather than permit automatic renaming. Complete explicit dates are required; missing data and contract terms are never manufactured. Exact existing height/foot/refresh enums apply. One research claim prevents duplicate paid dispatch; fetch and body parsing are bounded at 25 seconds, abandoned claims recover at 60 seconds. Player/identity/field baselines and a row lock make each decision batch atomic. Canonical guards request review and unpublish accepted changes. Browser/legacy access to protected proposals is denied; service-only RPCs and owner-only helpers add no browser platform grants.

## Local validation

- Final `npm run check`: 2,077 tests passed, zero failed/skipped; all TypeScript projects; production build; initial workspace gzip 144,093 / 150,000 bytes, nine chunks. Player Profile remains deferred.
- Eighteen actual PostgreSQL details cases and sixteen Home cases cover canonical/tenant/edit permissions, immutability, mixed/partial/duplicate/conflicting decisions, typed bounds, concurrent/stale claims, unchanged legacy contracts and review admission. A canonical operator without a legacy global team row is tested only for the new details RPCs.
- Ten new real-component browser cases at 320/390/768/1440 cover comparison, assigned editor, conflict, uncertain write, timeout, initial read retry, research retry, running/resolved state and confirmed-save/failed-parent-refresh recovery. Existing preparation, Home/keyboard/task/Undo and five-width statistics workflows also pass. Uses the existing harness and CI; no new dependency/framework.
- Synthetic provider/fixture results do not prove a live model/provider, actual ordinary-staff account, physical iPhone/Safari or independent real-agency acceptance. Those programme gates remain open.

Local logs: `/tmp/redream-platform-programme/player-details-ui-full-check.log`, `player-details-final-browser.log`; synthetic screenshots in `player-details/`.

## Exact staging manifest

Apply only these two files in order, without history replay, backfill or customer row rewrite:

1. `20261024142123_approval_first_player_details_review_v1.sql` — SHA-256 `571bb95786e54b7a2797d33825eb2d87daf346191705ed3d6db4993d5950431f`. Partial lookup index, guarded ledger triggers/restrictive browser policies, private validators/access helpers and four service-only request/stage/status/decision RPCs. Preserve existing canonical guards.
2. `20261024151913_connect_player_details_reviews_to_personal_home_v1.sql` — SHA-256 `f4943d4b86adacfe39d91e90356b0286fdb35349fc0ff54e46397210060e18ae`. Narrow guarded patch of actual personal Home body MD5 `7fd36db2f038e41afe788a759272794f`; preserve OID, owner, configuration, ACL and business admission.

Never execute excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`. No db push/include-all.

Deploy only the exact committed `agency-os/index.ts` and seven existing dependencies: `_shared/player-profile-preparation.ts`, `_shared/football-data/player-data-workflow.ts`, `_shared/player-profile-ai.ts`, `_shared/player-profile-text-improvement.ts`, `_shared/player-context-ai.ts`, `_shared/profile-stat-evidence.ts`, `_shared/staff-read-contract.ts`. Keep JWT true. No statistics/public worker, secret, provider, schedule or configuration change. Deploy matching exact frontend to the existing staging project, inspect READY/project/Git SHA, then assign only its canonical staging alias.

Staging project: Supabase `ltvmopvarlnidiozvpow`; Vercel `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`. Current recovery target: frontend `0920c1ee864400cdf2a2a98c1c46853016c0bcc2`, READY `dpl_987PXR5ziBgJAY3VX4xXUJ3N75KF`, agency-os 59, statistics 14, public 9. Baseline seven players/full-row MD5 `6e9392dc6b3dc877bfb90c47aeedbb93`.

Fresh preflight backup is `/tmp/redream-platform-programme/player-details-staging-before.json`, including actual eight worker files, security/performance advisors and catalog. All worker files match parent PR 258. Canonical guards match test sources: player `8213b8db19de8ed3b9a5565f9902ba0c`, public profile `892f6bbd5a84852275ca2224c2048357`, unpublisher `f315879e91167ce5139142abcdb194a9`. This increment does not replace those bodies.

## Staging rollout and active canary

Both exact migrations above are installed on staging under their canonical versions. Tool-generated ledger timestamps were normalized only after exact name, single-statement MD5 and absent canonical-version guards. Existing canonical protection body/configuration/owner/ACL is unchanged. New service-only RPC/helper grants are correct. Security/performance advisory findings match preflight after excluding observation timestamps.

Product `47766ccae3d11d99aa4b261283fa39770acd0ff5` is READY at deployment `dpl_A9Q61M7V6ThjR9Hu1T6xfpwgPKZ7` (preview target, Next.js) and assigned only to the canonical staging alias. Immediate previous frontend recovery target is `dpl_987PXR5ziBgJAY3VX4xXUJ3N75KF`. agency-os 60 matches all eight committed source files and retains JWT; statistics 14/public 9 are unchanged.

Active disposable Northstar F1 fixture: player `245db8c2-8ece-4634-995a-7a3d1a8b1ed8`, details review `e986835d-da4a-434f-a247-50356641f54e`, statistics review `76d0797a-5e24-4d6c-aaed-677d63d4d8d7`, career row `fa729778-e172-4654-b9f3-f80c3ea5f2c9`, task `5587ed7e-4ec6-40ab-a07b-3992b2638f67`, creation event `b6d2ed44-8274-4194-89a3-2d5566ffc32e`. Seed: `/tmp/redream-platform-programme/player-details-canary-seed.sql`. Do not replay it or remove unrelated data.

Actual owner Home -> same-tenant field comparison at 390px -> accept expiry/club, correct nationality list, retain recorded height passes. Canonical values, source history/original suggestions and actual trusted actor audit agree. The old published profile becomes unavailable; verification is requested separately; career figures remain 8/5/450/0/unknown, the ordinary task stays open and all seven original-player hashes match. Exact decision replay is audited once. Older statistics correctly refuse acceptance after the club change; this exposed a generic HTTP 500 for a plain PostgreSQL `player_stats_context_changed` object. The narrow follow-up returns clear allowlisted 409 messages for that condition, already-resolved statistics and details conflicts; 22 focused HTTP tests plus final 2,077-test check/typecheck/build/budget pass. No raw database details are exposed. This mapping follow-up still needs its matching staging deployment/canary.

Screenshots: `player-details/hosted-reviewed-390.png`, `player-details/hosted-public-denied-390.png`. These are desktop responsive Chrome checks, not physical iPhone/Safari acceptance.

## Remaining release gate

Publish/deploy the checked conflict-message follow-up; no migration replay. Compare retrieved worker sources/JWT and exact READY frontend. Finish the existing F1 canary with clear stale-statistics recovery, explicit obsolete-suggestion rejection, separate verification, refreshed Home/Calendar and continued public denial. Clean exact fixture dependencies, preserve creation/decision audits, compare original-player hashes, guard/grant/advisor drift. Record actual hosted results and exact-head CI. Keep every broader programme item and device/provider/role/agency gate open until verified. Do not merge or deploy production.
