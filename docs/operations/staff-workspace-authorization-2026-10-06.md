# Staff workspace authorization release, 2026-10-06

PR: https://github.com/FredDelaney/DJM-Onboarding/pull/197

## Scope

Staff access now follows the visibility contract through the UI, authenticated Edge handlers, public RPC wrappers and direct database policies. Owners and administrators retain the commercial workspace. Agent, scout and operations users keep assigned football records, shared basic Network identity and their personal tasks, meetings and Calendar. Unknown explicitly selected tenants are rejected rather than replaced with another workspace.

- Private commercial Home feeds, deal rooms, club needs, market mirrors, player service, archives and lifecycle actions require administrator access.
- Football profile reads require an assignment and return an explicit safe projection. Football writes require the trusted assignment's can_edit permission. Contract, economic, document, sharing-token and internal communication fields are excluded from staff projections.
- Own-task proposals validate the actor, current ownership, payload target and workspace on prepare, execute, undo and history. Personal Calendar behavior and the separate approval-first Tell implementation are preserved.
- Contact reads and write responses expose shared identity plus the current user's interactions, tasks, meetings and routes. Owned meeting briefs avoid commercial retrieval. Player-typed shadow contacts are excluded.
- Player creation and recruitment promotion grant the creator explicit editor access. Existing duplicates and previously promoted records still require prior access.
- Messaging player selection and binding require assignment and an active, nonarchived player. Lifecycle guards validate the target tenant as well as the selected workspace.
- Restricted navigation and visible scope copy avoid presenting private data as false zero totals. No private operations prefetch runs for nonadministrators.

## Reconciliation and migration

The release incorporates main through 80425c75332774c174580b4db05ac8d7c8c63ed9, including the other chat's ranked Home, approval-first Tell, capture schema repair, worker context resolver and player self references. Its separate uncommitted core loops and agreements work is preserved.

| Migration | Purpose |
| --- | --- |
| 20261006115900_staff_boundary_prerequisites | Missing-only staging compatibility, nullable archive and player binding fields, exact legacy definition repairs |
| 20261006120000_staff_workspace_authorization | Staff authorization, trusted player edit permissions, proposal/lifecycle guards and 17 RLS policies |
| 20261006120100_staff_workspace_projections | Personal and assigned safe response projections |

All three are applied to staging and production with their canonical CLI versions. Only the three newly inserted, exact version/name-matched metadata rows in each environment were reconciled. Older migration history was preserved. Definition patches stop if their expected source appears other than exactly once. Existing modern functions and ACLs are preserved except for explicit server-only grants. No customer rows were rewritten.

## Backend release evidence

| Production function | Active version | JWT required | Bundle SHA-256 |
| --- | --- | --- | --- |
| agency-os | 32 | yes | c22babd7af74d1f82c685eea6519febf7d97a1250d82bb8c35ba7e9af7058c1d |
| agency-market | 10 | yes | c9f0e87f016a3dc16878b1fd3f47a71236aaf019c78adda221fa2a3f5c4234ad |
| player-os | 2 | yes | d3b501c93ce1eab00a9bdb0a7dda47e2e293d3c61a2e1290d03bc5be7ff84bdc |

All 51 guarded replacements across 43 database definitions were checked in each environment after migration. Production's 17 changed policies match the intended administrator or assigned view/edit predicates. All 354 production and 360 staging platform_server RPCs deny anonymous and authenticated execute. Six production HTTP checks reject missing or invalid bearer authorization with 401.

Staging agency-os version 34 belongs to the other chat's newer, unmerged core loops work. It was preserved with bundle e3f89ce77f98d7f4711b86ee8295092754a41a54dcdbfb818c3d4a8cd94d3ca3. Our three temporary staff-access-qa canaries compiled and ran with matching production bundles; all six missing/invalid authorization checks returned 401. Remove only those three canaries after verification. Do not replace the main staging functions while reconciling the other work.

## Verification and release gate

- npm run check passed: 1,557 tests, type generation/type checking and a production build.
- The database fixture executes the migrated SQL with two synthetic tenants, role changes, RLS, mutation sentinels and private retrieval traps. The historical missing-prerequisite staging variant passed 11/11 cases. The unfixed baseline fails genuine authorization assertions.
- HTTP fixtures execute real handler code and cover assigned/unassigned players, trusted/forged roles and edit flags, unknown tenants, safe fields and administrator access.
- Browser journeys passed for agent, scout and operations workspace behavior, complete 250-player pagination, exact records, keyboard search, retry/timeouts and account changes. Calendar passed 12 viewport checks. Customer entry passed 24 viewport checks, recovery and owned-player entry scenarios. Fixtures use fake backends and send no real emails or payments.
- Independent code and migration review approved the implementation with no critical or important findings. Required CI verify and browser_journeys passed for implementation commit e632ae4efcbb2aefeecdc5d7cb31c850e27065cd.
- Merge requires both checks on the final PR head. Both production web deployments must be READY on the exact merged commit, with app.djmsports.com and redreamsystems.com assigned to their respective projects. Re-run the live public entry and responsive smoke suite after deployment; record deployment IDs and final results in PR 197.

The backend evidence above is already live. This document is committed before the web merge, so the PR release record is the source for final web activation and canary cleanup status. Function/policy and Edge bundle rollback snapshots were captured on the operator's device before deployment. This pass does not establish real billing settlement, mailbox delivery, Safari/iPhone behavior, legal contracting readiness or genuine pilot outcomes. These remain the operational gates in customer-readiness-remediation-2026-10-06.md. Its wider staff-authorization and missing-archive-column findings are addressed by this release; other historical staging differences still need individual reconciliation.
