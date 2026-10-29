# Current salary controls in a player-club opportunity

Programme: REL-02-A / REL-02-B / UI-06. Implemented and locally validated; **not installed or accepted on staging**. The full matching and request-to-outcome work remains open. Formal acceptance stays 2/63 (3%).

## User problem and resulting behaviour

A numeric salary comparison could be displayed while a legacy high fit/commercial score still made an unaffordable route look ready. Existing pitch and deal writers checked career direction but did not enforce current base-salary feasibility.

The existing opportunity now shows the current exact minimum/target, club budget, currency/period/tax basis, source status and missing evidence before new pitch/deal actions. Its existing player salary editor is available in context; correcting canonical terms refreshes this comparison. This reuses the canonical requests, player facts, matches, private audit, pitch/deal writers, shared form/recovery/overlay helpers and SDK transport. No parallel candidate or approval table, dependency or architecture is added.

Confirmed compatible base salary permits progression. Missing/incompatible evidence, a target outside budget or a confirmed minimum conflict requires an explicit admin decision. Exploration records a reason and a selected UTC expiry within one year; it does not modify facts, career controls, verification or contract terms. Approval is bound to the exact player/request/club context and current source fingerprint, and requires the approving administrator to remain active. A human hold survives source corrections until explicitly reviewed, but never transfers to another context. Expired or superseded decisions cannot open the gate. Career and financial states remain distinct.

Client commands have exact immutable UUID receipts. Stale/invalid inputs retain the draft; uncertain results permit checking the saved status or deliberately retrying the same command. Reads and writes have 12-second deadlines, cancellation/lifetime/identity guards and serial mutation admission. Core opportunity refresh/error preserves the financial draft. Back/Escape/discard and nested source editing reuse existing controls. An old read or a reply for another player/club cannot enable actions or expose that player's amounts.

The canonical matcher no longer fabricates 55/68/72 commercial contributions or an aggregate score for automatic candidates. New aggregate/commercial values remain null. Generic blockers/unknowns contain no private amount/source prose in staff-readable match reasoning. Existing manual selection, scores, status and evidence remain. Legacy unsupported percentages and hard-blocked percentages are suppressed in presentation. This does not establish full football suitability, registration, availability, source freshness or career acceptance.

## Exact pending deployment manifest

Target staging project only: `ltvmopvarlnidiozvpow`. Production `xogoigaaskmuspiehkba` is untouched.

1. Prerequisite already installed: `20261028224735_player_salary_terms_and_comparison.sql` and staging `agency-os` 65, as recorded in `redream-player-salary-review.md`. Do not replay.
2. New **UNAPPLIED** migration: `supabase/migrations/20261028230249_pursuit_salary_constraints.sql`, CLI-created version 20261028230249. SQL SHA-256: `73398bd02d920d070e7beaa8c68483cfe06823f3c85d588687c97aa8b91293a7`. No new table/column, data rewrite, table grant, RLS policy or configuration. Guards reject unreviewed source/security drift. Existing OID/owner/ACL/mode/path/volatility must remain unchanged. If a deployment tool returns a different ledger version, align the filename with identical bytes and record it, without replay.
3. Deploy `agency-market` from the same validated source with its existing closure/JWT/import-map settings. Adds only the two scoped admin salary-review actions and the canonical financial-denial code. `agency-os` 65 already selects the admin fast-reader overload and needs no new deployment for this increment.
4. Matching frontend: `AgencyPursuitRoom`, `PursuitSalaryReview`, `AgencyOpportunitiesWorkspace`, `AgencyOperatingWorkspace`, `PlayerSalaryTerms`, SDK error-code preservation and evidence presentation from this increment. First create a validated immutable preview; do not move the canonical staging alias until the coordinated backend and real-role canary pass. Installing the new enforcement against an old frontend would leave the old client unable to resolve financial holds.
5. Observe exact-source CI, compare installed sources/metadata/advisors and original business projections, then run a rollback-only actual-role canary for comparisons/receipts/expiry/source changes/career/verification/native writes/tenant isolation. Accept the signed-in player -> request -> opportunity review on the candidate frontend, including failed/uncertain recovery and four widths. Only then alias staging. No hosted acceptance is claimed here.

Never execute `20260930142119_restore_redream_relationship_person_entrypoint.sql`. No merge, production, real commercial-term mutation or external communication is authorised by this manifest.

New routine body MD5s:

| Routine | MD5 | Access |
| --- | --- | --- |
| `private.lock_pursuit_salary_context(uuid,uuid)` | `8f11328cee6e122523c5007093f4da61` | Owner-only invoker |
| `private.pursuit_salary_gate(uuid,uuid)` | `a0788bdd9c4e163b60087844c969cc2a` | Owner-only stable invoker |
| `platform_server_pursuit_salary_review(uuid,uuid,uuid,uuid)` | `0e2b7f65491c0eccfbe653839058b85a` | Service-only, active selected-tenant admin actor |
| `platform_server_record_pursuit_salary_review(uuid,uuid,uuid,uuid,text,text,text,date)` | `ccc2762f55bc4fafe9082a410c300664` | Same authority, context locks, audit receipt |
| `private.assert_pursuit_salary_progress(uuid,uuid)` | `48c927d89924c3ba06e9f69951b7f9fd` | Owner-only invoker |
| `private.enrich_need_salary_reviews(uuid,jsonb)` | `f7fb261b718e3a73ef59d80904be4683` | Owner-only stable invoker |
| `private.guard_pursuit_financial_write()` | `2a7725d895c5edaf2a7eb0df177dc036` | Private definer trigger; execute revoked from client/service roles |

Guarded existing routines (before -> expected after body MD5):

- `djm_os.refresh_need_matches(uuid)`: `5717ce0f9e0cbf44db1475f275a1f7c9` -> `339ceeb21d27dd9298bfb996c91d4329`.
- `platform_server_create_pitch_draft(uuid,uuid,uuid,jsonb)`: `1650aab999181a817633f6e057a70a4f` -> `c63e9f5eea4fee38a450608b9c04ea3c`.
- `platform_server_publish_pitch_link(uuid,uuid,uuid,timestamptz)`: `6ef83cabafd3ecab37e282af4f1e3aa1` -> `eef28b7292cfd7de340fbaf970ac1b77`.
- `platform_server_convert_pursuit_to_deal(uuid,uuid,uuid,jsonb)`: `64e62557366ffb4d76a55979859bdccb` -> `760b72b223f8af975c691e0ee78759dd`.
- `platform_server_workspace_need_record(uuid,uuid,uuid)`: `7b7a00feb1a0365dd090b9fe87f01a10` -> `9149af8ab5c1ac2ce4490a30483d2e96`.
- Admin `platform_server_demand_control_fast(uuid,integer,uuid)`: `6003e30014faa9d6ae12916a64a1dace` -> `e407c16a9fb32691a3387a51ecb19a78`.

The original broader two-argument fast reader stays byte-identical with no new private amounts. Career dependency body `2088a069c07de181aeeaf925ffed8c00` and salary comparison `a3a298d8f86b038c7c31c359797bdc9e` are checked, not replaced. Audit authority remains private. Existing native staff-write paths require three triggers on linked share publication, active pitch context and new/changed request-linked deals. General unlinked shares/deals, deactivation, passive view counters and delivery/stage/history updates are preserved. This prevents an RPC-only bypass without broadening existing permissions.

## Local evidence and outstanding gates

- `npm run check`: **2,252 tests pass**, every TypeScript project, production build and workspace gzip **146,180 / 150,000 bytes**. The initial run found only an obsolete source assertion for the career-only deal lock; it now asserts the combined career/financial lock, retaining the original intent. The final complete run is green.
- 28 PostgreSQL cases include the real captured matcher/writers, immutable dependency guards, existing metadata preservation, manual-score preservation, both admin read models, private-source boundaries, exact receipt/replay, changed evidence, source-persistent hold, active-approver status, UTC expiry/expired receipt, context changes, career/verification denial and native authenticated publication bypass. The dependency fixture loads the actual unchanged career body, then deliberately stubs career states for financial isolation; it does not claim full career acceptance.
- Browser: twelve financial scenarios (normal, wrong player, wrong club, core refresh, failed read, definitive denial, source conflict, uncertain acknowledgement, exact-command retry, timeout, canonical terms editing and late scope reply). Existing pursuit continuity also passes page/drawer at 320/390/768/1440, nested follow-up dismissal, focus return and scroll restoration. Phone/desktop review output is inspected.
- Prior exact-head 8e5cf88 CI 40783592354 has verify success but browser failure in the existing club editor fixture. Platform-polish and design-system fixtures now return the required canonical save acknowledgement and definitive denial code; production recovery remains unchanged. Scoped agency 24 screen/width checks and production-mode design editor confirmed-save/denied-retained-draft cases pass. New-head full browser CI remains a release gate.
- Actual signed-in staging Calendar read check on 29 October: correct DJM owner scope, Agenda/Month loading, next-month navigation and Today recovery, clear empty state, no record writes. Proof: `/tmp/redream-platform-programme/calendar-readonly-20261029.png`. This is the existing hosted artifact, not the new financial frontend or a physical device.

Private validation logs/images are under `/tmp/redream-platform-programme/financial-gate-*` and `pursuit-salary/`. The rollback-only actual-role candidate canary passes as recorded below. Installed-backend advisor/projection verification, exact worker/frontend installation and authenticated new-frontend acceptance, ordinary staff, physical iPhone/Safari, independent agency and all remaining 46/17 programme gates stay open. Never use this local milestone as a production verdict.

## Rollback boundary

Before alias acceptance, retain the prior accepted immutable frontend and exact agency-market source/settings. Once enforcement is installed, keep the matching review-capable frontend available while investigating; blindly restoring an older client would remove its way to resolve holds. An emergency rollback of enforcement needs a separately reviewed forward migration restoring captured canonical bodies and removing only these three new triggers, plus worker/frontend coordination. Never edit applied SQL, erase audit decisions/source facts or replay excluded history. This manifest intentionally performs no rollout or rollback.

## Candidate staging dry run, 29 October

Candidate application source is `b0352673c018c2011e5d45b9bc998d9d62062262`, pushed to both programme refs in draft PR 281. CI 40831228169 has verify success; full browser journeys are still running at this checkpoint. No job was restarted or treated as terminal from an observation timeout.

The exact candidate migration and the retained prior salary canary first ran in a single transaction ending in ROLLBACK. Both compiled and passed against the actual staging schema. New reusable `docs/operations/sql/redream-pursuit-salary-canary.sql` then passed in that same rollback-only envelope, using actual invited identities, memberships, career gate, canonical writers, branding and canonical dossier-draft creation. It proves:

- Current confirmed salary conflict and financial hold, explicit reasoned exploration, exact replay/no duplicate receipt and changed-command denial.
- Exploration cannot bypass missing career strategy or player verification. With a synthetic approved/player-confirmed aligned strategy and verified branded dossier, the canonical private draft, publication and internal linked deal succeed. No token is returned or sent, and all visibility changes remain uncommitted.
- Native publication/reactivation and active-content changes, active context linking and direct linked-deal insertion cannot bypass a hold. Existing passive view/delivery history and deactivation continue to work under the actual authenticated table policy. A general unlinked profile share remains possible within the same rollback.
- A source correction retains a manual hold, stale source decisions fail, compatible current confirmed terms can be deliberately resumed, manual shortlist/99/evidence survive matcher refresh and foreign/non-admin/browser-role boundaries remain.

Initial expanded fixtures omitted required human deal inputs and required tenant/profile contact identity. They now provide explicit synthetic human stage/probability and use the existing canonical branded dossier creator. No product check, default, trigger or constraint was changed to make a fixture pass.

All nine original business projections match before/after: 7 players, 1 market-facts row, 4 matches, 5 requests, 151 audits, 0 share links, 2 deals, 3 career strategies and 1 public profile. The ledger remains at 20261028224735, with zero new financial functions/triggers installed, zero synthetic salary users/tenants and zero persisted structured salary rows. Evidence: `/tmp/redream-platform-programme/financial-gate-staging-rollback-final.json`. This proves a candidate transaction, not a completed rollout or new-frontend acceptance.

Automatic Git deployment `dpl_GzjTaBDvQp41MFBuv6iBdhLvche7` and the explicit source-pinned preview `dpl_3sNR1UiFtjtvMa79bHRmBnzLKqGS` are CANCELED. The exact build log shows the configured ignored-build command `test "$VERCEL_GIT_COMMIT_REF" != "saas/tenant-foundation"` returned 0. No settings or billing were changed and no bypass was attempted. A precise one-preview exception after full CI is requested from Jesse; until authorised, do not override that command, move an alias or install enforcement against the old client. Accepted staging remains the READY 4604652 artifact `dpl_4wsNgykoeXVWEFqBFmhDaufr8bDK`. The actual `agency-market` baseline is version 10, ACTIVE, JWT true/no import map, bundle SHA-256 `a250e369667e175ac106b7d4737c20ad170a2481076ebb1e3fb6b37d0bed7718`; keep this exact source/settings for review and rollback preparation.

## Superseding money and release checkpoint

The current continuation also corrects explicit deal currency/commission transport/display and the CI-proven nested editor focus return. Its two additional **unapplied** migrations, exact source hashes, expanded actual-role rollback canary and full validation are recorded in `docs/operations/redream-pursuit-deal-money.md`; use that coordinated three-migration manifest for the next release. The earlier b035267 canary evidence remains historical evidence, not final-source hosted acceptance. b035267 CI 40831228169 is terminal: verify passed, browser failed on parent-modal focus return. The corrected production-mode deal/club/contact cases now pass.

Jesse has answered the previously pending question: **allow one staging preview after CI passes**. The exception is unused and is limited to a per-deployment ignored-command override; no global setting, billing, production or merge authority is added. Publish/observe the corrected source before that preview, then carry out coordinated backend/worker/canary and signed-in frontend acceptance. Staging remains on its accepted old artifact; no enforcement is installed yet.
