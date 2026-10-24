# ReDream platform programme: authoritative execution plan

Owner: Codex, requested by Jesse Edge on 23 October 2026.
Status: active. The whole programme remains open.
Current working branch: `codex/redream-profile-settings-stats`, stacked on `codex/redream-profile-stat-publication` (PR 255), whose parents are PRs 254, 253, 252 and 251.
Baseline: merged production PR 250, `09831dadc94621fb43e9d56265c9bd2d4a8a2bcd`.

## Start here on every continuation

1. Read this plan's Current checkpoint, register and UI matrix before selecting work. Inspect the checkout/branch and preserve unrelated user changes.
2. Select the highest-value unblocked item. Read its relevant product, visibility, architecture and operation sources; inspect and reuse existing implementations.
3. Deliver a coherent increment including affected UI states, meaningful regression checks and evidence. Existing tests are useful; do not rebuild existing systems or run unrelated investigations.
4. Update this same file before each delivery commit: task IDs, actual status, implementation/test evidence, blockers, remaining work and the next exact action. A final response is a checkpoint unless final acceptance is actually achieved.
5. Commit and publish reviewable work. Keep each commit recoverable. Resume from the last checkpoint after context/session/usage limits; do not reconstruct the backlog from chat or temporary files.
6. Reconcile the complete register and UI matrix at each milestone. Never drop unfinished scope, silently change acceptance or mark a whole workstream complete after one local fix.

This plan is the persistent source of truth. Earlier audit/release notes remain evidence, not an alternate task list. Add newly discovered work with a stable ID and dependencies; never erase unresolved rows. This file replaces the temporary programme brief as the execution tracker.

## Status and evidence rules

- `todo`: programme acceptance has not been established. This does not mean an implementation is absent.
- `active`: being inspected or changed now.
- `implemented`: code exists; validation or hosted acceptance is still pending.
- `validated`: appropriate tests and relevant UI/permission checks passed, with evidence linked below.
- `released`: authorised rollout and the required actual live acceptance passed.
- `blocked`: name the exact external/input dependency and continue independent work. Required human/provider/device checks remain open.

No arbitrary completion percentage. A code commit, mocked provider test or desktop screenshot alone does not prove live integration, physical-device quality or programme completion. Final completion requires every applicable register and UI row accepted, with any exclusions explicitly resolved with the user.

## Current checkpoint

- Initial programme registration: validated. All 46 delivery items and 17 UI surfaces are retained below.
- Existing PR 250 hardening remains the baseline; it must not be undone or rebuilt.
- DAY-01 roster increment is implemented: meaningful service moves and actual recorded work take precedence over generic setup. One explicit next-step control replaces duplicate buttons; quiet setup and real deadlines are distinct. Work-view/Home propagation and hosted acceptance remain open.
- PLY-02 staff/public/CV increments are implemented: automatic and selected figures show their actual period, club, source and checked/reviewed/updated date; custom figures never inherit automatic source or freshness. Public previews and real PDF exports now retain that context, including mixed-period evidence per figure. Unknown G+A/appearance values do not become zero; genuine zeroes remain. Hosted publication/public-output acceptance remains open.
- DAY-02 Home increment is implemented: server-authorised player-data flags have an expandable review group and no longer consume all five business priorities. Actual overdue/today deadlines take precedence over keyword categories; undated commands do not claim Today. Failed assignment reads have a direct Retry action. Existing completion, Undo, responsibilities and permissions are preserved.
- OPS-02 and a scoped OPS-04 observation-boundary repair are applied and canary-validated on staging: canonical entity tenancy, active staff ownership, repeat-call protection, unresolved-record reporting and restrictive observation RLS. The original cron failure and global-team exposure are reproduced in real PostgreSQL before the repairs; nine regression cases pass afterward. A rollback-only hosted two-agency canary passes; production migration/actual cron acceptance remains open. Staging has no scheduled change-review job and none was added.
- First delivery: PR 251, head `978b925`. Verify, full browser CI and all preview checks pass. Browser CI originally exposed an obsolete roster expectation; the corrected existing fixture verifies actual work/date, work-view routing and absence of setup writes. No check is waived. Exact first-delivery manifest: `docs/operations/redream-platform-programme-first-delivery.md`.
- OPS-01 branding follow-up is prepared: all 11 missing contracts were reconciled against actual deployed worker sources. The missing branding writer is called by deployed `agency-os` 43; the four other deployed workers do not yet reference their source-version missing contracts, and launch/adoption/public-sandbox workers are absent. This is one proven broken live dependency, not 11 proven live failures. The follow-up restores only the canonical branding writer and preserves the working staging definition exactly. Details and its separate one-migration manifest: `docs/operations/redream-owner-branding-contract-recovery.md`.
- Branding follow-up: PR 252, head `d424d56`. Verify and full browser CI pass. Its canonical migration is applied to staging while preserving the existing writer's OID/body/owner/ACL. A synthetic owner-save, audit and foreign-caller-denial canary passes and rolls back all data. Production restoration remains open.
- Third increment: PR 253, reviewed product head `98c77ee`. Verify and full browser CI pass (browser job 22m 43s). Exact staging frontend build `dpl_Bo3dRZwtNMMH2kenqvXYiQ4JjnSa` is READY and serves only the canonical staging alias; staging workers `agency-os` 56 and `player-profile-public` 9 match every reviewed source file and retain their JWT settings. Automatic Vercel success initially meant an ignored/canceled build, so it was not accepted as deployment evidence. No old snapshot is backfilled or automatically republished. Manifest: `docs/operations/redream-club-stat-context.md`.
- Staging checks: signed-in Northstar Home cold-load, grouped-review disclosure, same-tenant player-review link, correctly branded club preview and close recovery pass. Unauthenticated agency access is 401 and an unknown public slug returns `{data:null}`. Hosted automatic/selected/custom publication and actual PDF acceptance remain open.
- Active isolated PLY-02 staging canary: player `ade1f219-6996-45bb-ae53-e33595faec8c`, labelled `[QA] Programme Stats 2026-10-23-C1`, belongs only to Northstar staging. It was created through the existing guarded agency writer, with three explicitly synthetic career rows; historical row `6c4d4fe8-4b68-4353-9b44-328b13013b46`. It has been published only as a synthetic canary. Finish automatic/historical/custom publication and PDF checks, then unpublish and clean up this exact fixture; never edit a real player as a canary. Seed/result/baseline are under `/tmp/redream-platform-programme/stat-canary-*`. Initial staging player count 7, hash `6e9392dc6b3dc877bfb90c47aeedbb93`.
- Canary finding: normal UI Verify & publish succeeds, but the actual stored snapshot replaces the approved reserve-row 24 appearances with 55 combined appearances and strips its source metadata. The public automatic read still returns the correct 24 and excludes the private sentinel. The legacy `private.set_public_profile_career_timeline()` trigger unconditionally rebuilds headline figures; its body hash `0c664e69200fe0dea818336f10165ff8` matches staging and production. The canary is now published at synthetic slug `qa-programme-stats-2026-10-23-c1-ade1f`; retain cleanup above. Repair only this verified trigger path with actual PostgreSQL publication/trigger regression coverage before accepting PLY-02 or promoting production. Do not disable its reviewed-career projection or existing source-link/verification/tenant guards.
- UX-03/UX-04 profile overlay repair is implemented and locally validated: the preview/editor/verification/Transfermarkt/share surfaces escape the real animated workspace through body portals. Preview bounds, scrolling, toolbar, 44px Close, focus isolation/wrap/Escape/return and reopening pass all four widths. The old source fails the new viewport regression at 320px. Manifest: `docs/operations/redream-profile-overlay-recovery.md`.
- PR 254 at `151ba22` passes verify and full browser CI. Exact frontend deployment `dpl_845i7uFoKSgkbFgZTrS8xAg4YaoE` is READY on the canonical staging alias (rollback `dpl_Bo3dRZwtNMMH2kenqvXYiQ4JjnSa`). Hosted 390x844 preview/editor bounds, independent scrolling, 44px actions, Escape/focus/background-position recovery and Northstar branding pass; screenshot was inspected. Physical iPhone and the wider overlay matrix remain open.
- PLY-02 publication-trigger repair is locally validated: one guarded migration preserves approved arrays and unchanged selections while retaining reviewed-career/source and legacy/raw-write filtering. All 13 actual PostgreSQL publication tests pass, including the reproduced hosted mismatch and four new integration cases. Full checks pass 1,997 tests, all TypeScript projects, build and bundle limits. Manifest: `docs/operations/redream-profile-stat-publication-recovery.md`.
- PR 255 at `c12dbf2` passes verify and full browser CI (job `120610534901`). Its exact publication-trigger migration is installed on staging only, canonical version `20261023191512`, installed body MD5 `92d954ee6e7a5de21b633517d4127abd`, retained owner/configuration/ACL and no player-row rewrite/advisor delta. Normal editor republishing exposed a second existing settings trigger: it converts empty automatic choices into combined custom totals before publication. The original seven players still match baseline; only the recorded canary is edited.
- Settings-trigger follow-up is locally repaired with a separate guarded migration `20261023193512_preserve_profile_stat_editor_choices_v1.sql`. It retains bounded editorial pairs only for the actual existing service-role writer; browser/legacy filtering, owner, grants and existing selected-ref/tenant/operator checks remain. Sixteen actual PostgreSQL cases pass, including the real settings upsert and publisher together, malformed-input and browser-claim denial. Manifest: `docs/operations/redream-profile-stat-settings-recovery.md`.
- PR 256 is published, initial head `f4d6c6a` verify passes. Its exact settings-trigger migration is installed on staging only with canonical version `20261023193512`, body MD5 `59fb8aa073bf49b5d238a054677f35c1`, unchanged owner/configuration/ACL/security findings. Normal UI reset/save/publish now retains automatic settings and actual stored/public 24 reserve appearances, 0 goals and correct metadata. The seven original player rows retain baseline hash `6e9392dc6b3dc877bfb90c47aeedbb93`.
- Further actual recipient checks found `/p/<slug>` blocked by the shared-host gate and SVG-logo text fonts breaking the PDF button. Both small frontend repairs are local: allow only the existing public single-slug route, keep private/legacy/nested denials, and reuse the existing document-logo raster converter with text fallback. All 2,003 tests, 14 focused actual PDF/gate checks, final TypeScript projects/build and corrected four-width browser checks pass. All three real PDF files contain the 300px raster logo and their rendered first pages were inspected. Initial CSP-blocked fixture only proved fallback and is not counted as logo acceptance. Export errors use a simple retry message.
- Next exact action: finish final frontend checks, commit/push the recipient/export repairs to PR 256, update its final description and stage that exact frontend. Do not replay either stat migration. Repeat the isolated canary for automatic/historical/custom settings/stored/public/PDF output and unpublished/unverified denial, then clean up its exact fixture and verify the seven-player baseline. Continue PLY-03 sourced review and TELL-05 whole-loop acceptance. Retain the full register and UI matrix; production remains behind its explicit release gate.
- Local checkpoint: product-head `npm run check` passes 1,993/1,993, all TypeScript projects, production build and bundle limits (workspace gzip 143,960 / 150,000 bytes). Focused dossier/publication tests pass 25/25. Three actual PDF exports, rendered-page visual inspection and profile browser checks at four widths pass. The subsequent fixture correction passes all 15 affected database tests plus TypeScript and does not change deployed production code. Follow-up-head CI and remaining hosted acceptance stay pending; the whole programme remains active.
- Production: no new programme changes deployed. Prior release permission does not silently authorise unrelated destructive actions or external sends.
- Acceptance participant: Jesse Edge confirmed he will be the DJM staff participant. DJM is the only real agency currently available. Existing staging tenant fixtures can prove technical isolation; real independent-agency acceptance remains explicitly pending, not satisfied by a fixture.

## Full execution register

| ID | State | Depends on | Outcome | Acceptance |
| --- | --- | --- | --- | --- |
| GOV-01 | validated | None | Track the complete agreed programme | This committed plan, explicit UI matrix and AGENTS resume pointer retain every workstream. |
| GOV-02 | active | GOV-01 | Verify and reuse existing capabilities | Record gaps and existing evidence per item before implementation; completed hardening is retained. |
| DAY-01 | implemented | GOV-02 | Truthful player priorities | Specific existing actions, overdue work and setup gaps are distinguishable; a missing optional action is not an urgent warning. |
| DAY-02 | implemented | DAY-01 | Useful personal Home | Local grouping, deadline, retry and permission checks pass; hosted priority acceptance remains open. Assigned work, material deadlines and low-priority reviews have clear priority and reasons; preserve current staff visibility. |
| DAY-03 | todo | DAY-02, TELL-02 | Consistent completion and ownership | Completion, reassignment, snooze and Undo reconcile across Home, Calendar, player/contact and capture receipts. |
| PLY-01 | todo | GOV-02 | Player and prospect lifecycle | Discovery, recruitment, representation and ongoing management use existing models; prospects never become signed players accidentally. |
| PLY-02 | active | GOV-02 | Understandable football statistics | The publication-trigger repair is installed on staging. Normal editor save exposed a second settings trigger converting automatic choices into custom totals; its bounded repair passes actual PostgreSQL upsert/publication tests. Hosted full save/publication/PDF acceptance remains open. Period, club, source, freshness and custom scope are clear; unknowns stay missing, zero stays zero and deliberate overrides survive. |
| PLY-03 | todo | PLY-02 | Efficient sourced review | Material changes have a specific accept/edit/reject path and resolve across surfaces; unsupported data remains missing. |
| PLY-04 | todo | PLY-02, PLY-03 | Club-ready player dossier | Identity, verified football context, real video, sources, missing essentials, preview and existing sharing form one clear flow. |
| PLY-05 | todo | PLY-01 | Useful private player experience | Career actions, appropriate agency updates and resources improve the existing player portal without exposing internal strategy. |
| REL-01 | todo | GOV-02 | Connected opportunity progress | Existing club need, player, contact, relationship, conversation, profile sent, response, negotiation and outcome retain context. |
| REL-02 | todo | REL-01 | Evidence-based football decisions | Club requirements and player evidence explain fit; readiness, player quality, fit and predicted outcomes remain separate. |
| REL-03 | todo | REL-01, DAY-03 | Accountable relationship work | Last meaningful contact, outstanding replies, owner, handoff and promised next action are visible and permission-checked. |
| TELL-01 | todo | GOV-02 | Broader conversation understanding | Realistic entity ambiguity, factual changes, attempts/negations, dates and conversation objectives have evaluated outcomes. |
| TELL-02 | todo | TELL-01 | Reliable connected execution | Existing structured actions log linked activity, complete supported objectives and create one useful follow-up with confirmation and Undo. |
| TELL-03 | todo | TELL-02 | Colleague and shared-work execution | Explicit multiple-person assignment and current responsibility work; no silent ownership transfer or revoked-access mutation. |
| TELL-04 | todo | TELL-02 | Resilient capture | Voice/text drafts, offline/reconnect, idempotent retry, corrections and partial failures retain the original evidence. |
| TELL-05 | todo | TELL-02, REL-03, PLY-04 | Whole agency working-loop acceptance | Conversation -> linked records -> accountable action -> opportunity -> club-ready profile -> personal follow-up is accepted as one journey. |
| DOC-01 | todo | GOV-02 | Player representation agreement | Existing template handles new player subjects, approved clauses/dates, agency branding and editable Word/PDF output. |
| DOC-02 | todo | GOV-02 | Mandate | Parties, player, territories/clubs, term and commission sharing are explicit, editable and branded using the existing workflow. |
| DOC-03 | todo | PLY-01 | Player acquisition pitch | Existing pitch is tailored to a prospect with truthful agency/player evidence, clear narrative and professional export. |
| DOC-04 | todo | REL-01 | Invoice and payment follow-through | Existing invoice supports reviewed recipient/banking/payment links and truthful manual versus provider-backed status. |
| DOC-05 | todo | PLY-02 | Club-facing scouting report | Evidence, sources and uncertainty are visible; report is editable, branded and visually accepted in actual exports. |
| DOC-06 | todo | DOC-01, DOC-02, DOC-03, DOC-04, DOC-05 | Shared document UX | Subject selection, AI assistance, template editing, preview, Word/PDF, long text and missing fields work consistently. |
| DOC-07 | todo | DOC-06, TELL-02 | Connected document lifecycle | Approved facts and Tell context reduce repeated entry; documents link to the right person/player/club/opportunity and follow-up. |
| DOC-08 | todo | DOC-06 | Honest external event tracking | Delivery/open/signature/payment claims use verified provider evidence or explicit manual labels; external actions require approval. |
| OPS-01 | active | GOV-02 | Recorded backend contract reconciliation | All 11 are mapped to actual deployed versions; canonical branding restoration preserves staging's writer and passes a rollback-only hosted owner/deny/audit canary. Production recovery and remaining future-worker contracts stay open. Repair required flows with scoped reviewed changes, not permissive wrappers. |
| OPS-02 | implemented | GOV-02, OPS-04 source boundary | Background change-review repair | Staging migration and real two-agency/repeat/denial canary pass with unchanged data. Staging has no schedule; production migration and actual cron execution remain open. Fix queue_change_review_items without cross-tenant routing or blanket bypass. |
| OPS-03 | todo | GOV-02 | Observed timeout follow-up | Investigate the recorded server network timeout; distinguish reproducible application failures from isolated transport errors and verify recovery. |
| OPS-04 | active | GOV-02 | Security findings review | Observation-table global-team RLS is repaired on staging with real allow/deny checks and no advisor delta. Production application and the other security-definer, GraphQL and password-protection findings remain open. |
| OPS-05 | todo | OPS-01 | Hosted migration parity | Relevant staging/production contracts and selected grants match reviewed release requirements; preserve historical ledgers and exclusions. |
| SAS-01 | todo | OPS-01 | Fresh agency onboarding | New agency branding, owner setup, first useful record and first working business journey succeed without developer intervention. |
| SAS-02 | todo | SAS-01 | Imports and responsibility setup | Record mapping, duplicate handling, staff invitation, memberships and player/task responsibilities work for a new agency. |
| SAS-03 | todo | OPS-01 | Real provider acceptance | Authorised email, Calendar and other supported providers demonstrate connect, read, permission expiry and recovery; fixtures are labelled honestly. |
| SAS-04 | todo | OPS-04 | Role and volume acceptance | Owner/admin/agent/operations/read-only/player and revoked access are verified at representative record volumes without privacy regressions. Actual membership statuses are invited/active/suspended/ended; the schema has no dedicated viewer role. Player denial does not establish read-only-staff acceptance. Resolve that capability explicitly without fabricating a tested role. |
| SAS-05 | todo | SAS-01, DOC-06 | Consistent tenant identity | Agency branding carries through private workspace, external profile, documents and relevant communications without DJM-specific bypasses. |
| UX-01 | todo | GOV-02 | Shared hierarchy and density | Headings, primary actions, quiet secondary controls, useful list density, badges and empty space are coherent across the page matrix. |
| UX-02 | todo | UX-01 | Shared visual language | Typography, spacing, colour meaning, icons, menus, buttons, fields, tables and feedback follow existing tenant-aware design tokens. |
| UX-03 | active | UX-02 | Overlays and long forms | Profile-preview clipping is repaired locally with body portals for the profile dialogs and four-width preview/scroll/focus coverage. CI/staging and the rest of the overlay matrix remain open. Drawers/modals/popovers/editors scroll correctly with long content; headers/actions remain reachable and stacking is correct. |
| UX-04 | active | UX-03 | Keyboard and draft safety | Preview focus isolation/wrap/Escape/return and existing editor draft/save/retry checks pass locally; hosted acceptance and the remaining matrix stay open. Focus, Escape, keyboard-only completion, unsaved drafts, confirmed writes, failed refreshes and Undo remain correct. |
| UX-05 | todo | UX-01 | Loading and recovery | Cold/warm reads, empty/error/permission states, stale requests, retries and duplicate submissions are clear and bounded. |
| UX-06 | todo | UX-01 | Mobile and accessibility | 320/390/768/1440 widths, text zoom, contrast, names, keyboard, safe areas and physical iPhone/Safari acceptance are recorded honestly. |
| UX-07 | todo | UX-05 | Measured speed | Establish and compare complete-job timings, cold/warm loading and bundle limits; measure rather than claim speed from a screenshot. |
| VAL-01 | todo | DAY-03, TELL-05, DOC-07 | Five real working cases | New player joining, club request, conversation-to-work, contract deadline and invoice follow-through have end-to-end evidence. |
| VAL-02 | todo | SAS-04, UX-06, VAL-01 | Independent agency acceptance | Jesse Edge is the DJM staff/iPhone participant; only DJM is currently available. A real second agency remains an external dependency. Record time, repeated entry, corrections, missed follow-ups and recurring use. |
| RELSE-01 | todo | All other programme acceptance items | Final programme acceptance | All required product and UI rows have current evidence, checks pass and deployment/production acceptance follows current user authorisation. |

## UI coverage matrix: required throughout the programme

For each row inspect the relevant shared primitives and record accepted evidence for: normal content; long/empty content; loading/error/retry; allowed/denied permissions; editing/draft/confirmation; overlays/scroll/focus; 320/390/768/1440 widths; accessibility and physical-device checks where applicable. Use explicit not-applicable reasons where a state truly does not exist. A shared-component fix does not automatically accept every page.

| ID | Page / workflow | State | Evidence / remaining |
| --- | --- | --- | --- |
| UI-01 | Home / agency overview | active | Grouped-review and business-priority browser checks pass at 320/390/768/1440, including keyboard disclosure, private-count exclusion, permission/assignment Retry and existing completion/Undo/responsibility controls. Signed-in staging cold load/disclosure and the same-tenant review link also pass. Full state/role/device matrix remains open. |
| UI-02 | Players roster | active | DAY-01 fixture: specific/setup/private/undated/future work, action routes, four widths, 44px targets and card-internal clipping passed. Full state matrix, keyboard/contrast and physical-device acceptance remain open. |
| UI-03 | Recruitment list / detail / creation | todo | Full required state coverage not yet recorded for this programme. |
| UI-04 | Player Profile / preview / sharing | active | Staff/public preview and three actual PDF exports cover custom, automatic and selected multi-period evidence, sources, timestamps and zero values. Four widths, photo switching/retry and existing controls pass. Preview viewport/focus/scroll and editor/draft recovery pass locally in the actual animated wrapper; staging rollout is pending. Remaining state matrix, hosted publication and physical-device acceptance stay open. |
| UI-05 | Player work view / intelligence / team | todo | Full required state coverage not yet recorded for this programme. |
| UI-06 | Opportunities / club needs / routes / outcomes | todo | Full required state coverage not yet recorded for this programme. |
| UI-07 | Network list / search | todo | Full required state coverage not yet recorded for this programme. |
| UI-08 | Person / club detail / contact editing / handoff | todo | Full required state coverage not yet recorded for this programme. |
| UI-09 | Calendar / task detail / provider state | todo | Full required state coverage not yet recorded for this programme. |
| UI-10 | Tell capture / review / receipt / Undo | todo | Full required state coverage not yet recorded for this programme. |
| UI-11 | Documents collection / templates / subject choice | todo | Full required state coverage not yet recorded for this programme. |
| UI-12 | Document editor / preview / Word / PDF / share | todo | Full required state coverage not yet recorded for this programme. |
| UI-13 | Agency onboarding / imports / staff invitations | todo | Full required state coverage not yet recorded for this programme. |
| UI-14 | Agency settings / branding / responsibilities / connections | todo | Full required state coverage not yet recorded for this programme. |
| UI-15 | Platform operator pages / access / recovery | todo | Full required state coverage not yet recorded for this programme. |
| UI-16 | Player-facing career / resources / agency updates | todo | Full required state coverage not yet recorded for this programme. |
| UI-17 | Public / token-shared club profile and document recipient | active | Club-profile preview/PDF statistics and publication HTTP allow/deny checks pass locally; source context fits four widths. Full public/token/document recipient state, hosted, branding and device matrix remain open. |

## Existing evidence and explicit open limits

- PR 250: 1,955 tests, all typechecks, build and 236 screen/viewport browser combinations passed; source and rollout are in `docs/operations/intelligent-agency-release-2026-10-23.md` and PR 250. Do not imply this accepts subsequent changes or every programme outcome.
- The 23 October focused production review found repeated generic roster attention, unclear custom-stat scope and a Home list dominated by data-review work. Preserve existing canonical/custom facts and personal responsibility boundaries while improving these surfaces.
- Latest release recorded 11 older missing backend contracts, the existing `queue_change_review_items` tenant-guard failure, an isolated unattributed server timeout and pre-existing grouped security warnings. Reverify exact current state before repairing; do not label every absent contract as a broken deployed journey.
- Existing staff tagging, shared task approval/Undo, photo attachment, profile verification and publication are implemented and accepted in the prior release. Extend them only for demonstrated gaps.
- Live provider OAuth/email, physical iPhone/Safari, real-volume role checks and independent-agency working-day acceptance remain explicit programme gates.
- Never execute the excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`, replay divergent historical ranges or add permissive tenant/role bypasses. Preserve existing grants, privacy and approved share boundaries.

## Evidence log

- GOV-01: full brief, 46 uniquely identified delivery items, 17 UI surfaces, dependency references and AGENTS continuation pointer recorded. `git diff --check` passes. GOV-02 and DAY-01 remain active; no product improvement claimed complete.

- DAY-01 roster increment: `npm test` passes 1,965/1,965; `npm run typecheck` passes. `node scripts/calendar-browser-fixture.mjs scripts/player-priorities-browser-qa.mjs` passes four widths, existing control/service routes, work-view navigation, restricted-data exclusion and masked card-overflow checks. Visual inspection caught and fixed mobile width plus margin clipping; page-level overflow alone was insufficient. The browser check is wired into CI and its synthetic screenshots are included in the existing CI artifact. No API, database or production data change. Full CI/release and the remaining UI matrix are not accepted by these local results.

- PLY-02 staff-profile increment: `npm run check` passes all 1,965 tests, every TypeScript project, production build and bundle limit (workspace gzip 143,744 / 150,000 bytes). `node scripts/calendar-browser-fixture.mjs scripts/profile-enhancements-browser-qa.mjs` passes automatic context, deliberately selected historical/current rows, deduplicated periods, correct source attribution, real zero values and custom-scope guidance. Existing photo upload, stale-player, unconfirmed-save recovery and four-width assertions also pass. Uses only existing stored metadata; no saved statistics, publication semantics, schema or customer data changed. Evidence is local; the wider PLY-02 and UI-04 acceptance remains open.

- DAY-02 Home increment: 1,969 tests pass, including four focused deadline/category tests; all TypeScript projects, production build and bundle check pass (workspace gzip 143,955 / 150,000 bytes). The extended existing `home-review-context-qa.mjs` proves 12 authorised review flags cannot hide a lower-scored real business deadline beyond the old ten-command cap; a private review is absent from both content and count. It covers truthful undated copy, existing profile links, keyboard disclosure, four widths and permission/assignment failure recovery without preparing writes. Existing Home work regression, edit/failure/double-tap/Undo and five-width responsibility checks pass. Local screenshots under `/tmp/redream-platform-programme/home/` were inspected; final collapsed mobile view is clean. CI artifacts retain these synthetic screenshots. Wider role/device/hosted acceptance remains open.

- OPS-02 read-only baseline: staging and production use the same legacy job body (`md5(prosrc) = bca01cd5fed1c6854f2fe394f09111ab`), the same tenant guard and service-role-only execute access. Staging has no low-confidence pending observation; production has one pending prospect observation whose canonical prospect exists with a tenant. The legacy insert sets no tenant and no prospect context, so cron has no trusted fallback. No hosted writes or cron invocation were performed. Prepare the repair locally with the actual guard, allow/deny and repeat-call coverage before any release decision.

- OPS-02 / OPS-04 repair: `tests/change-review-tenant-database.test.ts` passes nine actual PostgreSQL cases; the final `npm test` passes 1,978/1,978. It reproduces SQLSTATE 23514 for a prospect and the old cross-agency observation read, then proves canonical multi-agency review tenancy, valid current staff ownership, zero duplicate open reviews, source-evidence preservation, unresolved-record retention without primary-tenant fallback, source-table CRUD allow/deny, independent-agency staff without global DJM membership, revoked/read-only/anonymous denial, retained tenant-trigger checks and unchanged cron execute grants. Both migrations refuse unexpected definition/policy/grant drift. No other table policy, tenant trigger, schedule or customer row is changed. Hosted staging/production remain unchanged; production rollout requires its actual release gate. The remaining OPS-04 findings remain open.

- OPS-01 branding follow-up: production catalog read confirms all 11 contracts absent. Actual downloaded production `dispatch-player-push` 19, `dispatch-djm-email` 15, `accept-player-invite` 22 and `weekly-player-refresh` 20 contain none of their respective missing source-version RPC references. Current deployed `agency-os` 43 does call the missing branding writer. Staging has the canonical writer body (`57f28fb8730e57ef89babec7ff8c2d23`), owner/service-role-only execute and empty search path. The new migration restores only an absent writer, preserves a matching existing one and rejects unexpected body/config/grant drift. Six real PostgreSQL regression cases plus 14 existing account/launch checks pass (20/20), and all TypeScript projects pass; hosted customer branding has not been mutated. The other ten contracts and full fresh-agency onboarding remain open.

- DAY-01 CI follow-up: `node scripts/workspace-flow-browser-fixture.mjs scripts/workspace-loading-ux-qa.mjs` passes the corrected existing roster expectation plus all six page deadline/Retry cases, speculative warming, late-response rejection, desktop density, mobile touch targets and actual work-view navigation. The previous CI failure is retained as evidence of an obsolete assertion, not hidden by skipping a check. Only the fixture/assertions changed; no production code was modified for this follow-up.

- PR 251 (`978b925`) and PR 252 (`d424d56`): verify, complete browser journeys and all Vercel preview checks pass on their current heads. This is CI evidence, not a production release or hosted migration acceptance.

- PLY-02 public/CV follow-up: `npm run check` passes 1,993/1,993 tests, all TypeScript projects, production build and bundle limit (143,960 / 150,000 gzip bytes). Focused dossier/publication tests pass 25/25, including real HTTP-handler snapshots, private-field exclusion, restricted-staff projection preservation, correct historical/automatic/custom scope, invalid dates and unknown-versus-zero values. The existing profile browser fixture passes 320/390/768/1440, downloads three actual PDFs and proves preview/download performs no save or publication. Rendered pages were visually inspected; this caught and fixed unknown appearances rendered as zero and a stray single-stat divider. CI artifacts include the synthetic screenshots/PDFs. Exact no-migration/two-worker manifest: `docs/operations/redream-club-stat-context.md`. No hosted mutation, republishing or customer-data change; hosted/device/independent-agency acceptance remains open.

- Staging release checkpoint: PR 253 product head `98c77ee` passes verify and browser CI, run `40001447904`. Explicit frontend build `dpl_Bo3dRZwtNMMH2kenqvXYiQ4JjnSa` is READY on the canonical staging alias, backed by verified project `ltvmopvarlnidiozvpow`. Only the three exact canonical migration versions in the parent manifests were applied. Staging agency/public worker versions 56/9 match all recursive source contents; prior bundles and alias target were preserved for rollback. No production project, data, worker, secret or schedule was changed.

- OPS-01/02/04 hosted canary: `docs/operations/sql/redream-programme-staging-acceptance.sql` passes actual two-agency queue routing, repeat-call deduplication, unresolved subjects, source preservation, RLS CRUD/foreign-write denial, independent staff without global team membership, player/ended-membership denial and owner-only branding/audit. Every test write rolls back; exact before/after source/review/branding hashes, table grants and cron hash match, with no synthetic tenants left. Staging's existing branding writer retains OID 26209, canonical body, owner and ACL. Security/performance findings are identical excluding observation timestamps. The first canary attempt exposed unsupported revoked/viewer fixture literals; tests now enforce the canonical membership checks and use real suspended/ended/player states. All 15 affected database tests and TypeScript pass. No dedicated read-only-staff capability is claimed.

- Signed-in staging UI: Northstar Home cold reload completes, five actual business priorities remain visible, one authorised player-data flag expands separately, and its link preserves tenant/player/profile context. The actual club preview uses Northstar branding and the existing photo, with no manufactured figures when statistics are absent; close returns to the staff profile. Screenshots: `/tmp/redream-platform-programme/staging-home.png` and `/tmp/redream-platform-programme/staging-profile-preview.png`. Hosted automatic/selected/custom publication/PDF, other domains, actual production cron, physical iPhone and independent-agency acceptance remain open.

- UX-03 staging finding: actual screenshots expose the club preview confined inside the workspace and scrolled past its toolbar. Branding/content reads and Close functionality above are not visual acceptance of that overlay. Repair this concrete viewport/scroll/focus defect before accepting the hosted profile flow; the wider overlay matrix stays open.

- UX-03/UX-04 profile repair: the actual retained viewStage transform was confirmed from staging DOM/bounds. The existing workspace fixture now includes that animated wrapper. The new viewport assertion fails the old source at 320px and passes the repair at four widths, together with Close hit targets, independent long-content scrolling, background isolation/position, initial focus, Tab wrapping, Escape/Close return, reopening and the More-menu entrypoint. Existing four-width populated editor/draft/save/error checks, clean-profile cases and photo/verification/statistics/PDF regressions pass. Screenshots were visually inspected. `npm run check` passes 1,993 tests, all TypeScript projects, build and bundle limit (143,963 / 150,000 gzip bytes). CI, signed-in hosted overlays, physical-device and the remaining matrix stay open.

- PLY-02 live publication finding/repair: the normal staging UI verifies and publishes the isolated player. Staff and public automatic responses choose the reviewed reserve row (24 appearances, 0 goals, source/period/date), but the legacy database trigger saved combined 55 appearances without metadata. Staging/production trigger definitions match. The regression now runs the actual publisher, admin guard, career projection, aggregator and refresh trigger together: reproduces 55 before repair, then retains approved automatic/historical/custom/empty arrays, unchanged snapshots through metadata/refresh, reviewed-only career data, source sanitization, raw-write filtering, browser/foreign-context denial and owner/ACL preservation. All 13 focused database tests pass; `npm run check` passes 1,997 tests, all types/build/bundle limits. One new migration, no customer-row rewrite; no hosted application of this repair yet. The fixture remains explicitly tracked for cleanup.

- PLY-02 settings normalizer follow-up: reproduces the second actual hosted failure with the real settings upsert before publication, passes 16 focused database cases and the full 2,000-test/type/build/bundle check. Staging and production release acceptance remain distinct. Exact separate manifest: `docs/operations/redream-profile-stat-settings-recovery.md`.

## Complete agreed product and UI requirements

The following retains the expanded brief in full; the register and matrix make its execution trackable.

## 1. An agency command centre that earns daily use

- Give each person a short, explainable set of priorities based on assigned work, player responsibility, meaningful conversations and real deadlines.
- Distinguish urgent business work, material data changes and optional housekeeping. Group low-value reviews rather than filling the day with identical alerts.
- Show the reason, evidence, owner and useful next action. Allow dismissal, snoozing, reassignment and correction through existing permissions.
- Keep personal work and agency oversight clear. Completing a task must reconcile across Home, Calendar, the relevant player/contact and Tell receipts.
- Replace generic next-step filler with specific supported actions. Quietly show an honest empty state when there is no useful recommendation.

Finish criterion: an agent can identify the most consequential work and act on it without opening several records to reconstruct the context.

## 2. A complete player lifecycle

- Support discovery, recruitment, representation and ongoing player management within existing player/prospect models.
- Make player identity, current football situation, contract horizon, responsible staff, latest meaningful activity and current commercial progress easy to scan.
- Keep prospects and external document subjects usable without adding them to the signed roster.
- Make current-season facts, curated headline statistics, evidence sources, freshness and overrides unambiguous across profile, work view, CV and shared output.
- Let agents review meaningful changes efficiently while preserving verified facts and intentional editorial choices.
- Strengthen the existing player-facing experience with appropriate career actions, agency updates and useful resources, while keeping internal agency strategy and private club conversations behind their existing boundaries.
- Turn the existing club-facing profile into a strong dossier: immediate identity, relevant football context, real footage, useful current evidence and an obvious next step.
- Make missing video, contract or identity details actionable at the appropriate point in the workflow.

Finish criterion: an agent can review a player, understand the next move, resolve important gaps and prepare an accurate club-facing profile without duplicate entry.

## 3. A connected placement and relationship workflow

- Carry context through club need, suitable player, relationship owner, conversation, profile sent, response, negotiation and outcome.
- Reuse existing Opportunities, Network, player links and activity records. Validate their connections rather than building a parallel pipeline.
- Explain recommendations with actual club requirements and player evidence. Keep fit, player quality, readiness and predicted outcomes distinct.
- Make last contact, outstanding replies, relationship handoff and promised follow-ups visible where the agent makes the decision.
- Keep internal strategy, financial notes and private communication out of club-facing outputs unless explicitly selected for that purpose.

Finish criterion: the agency can answer who is moving a player opportunity forward, what happened and what should happen next.

## 4. Tell ReDream as a dependable execution surface

- Reuse the current structured action, permission, approval, audit, deduplication and Undo implementations.
- Broaden acceptance across real agency conversations: resolve entities, record linked activity, complete the actual satisfied objective and propose one useful follow-up.
- Support explicit colleague assignments and shared work without broadening access or changing ownership silently.
- Keep fact changes sourced and reviewed when needed. Ask a focused question when names or intent are ambiguous.
- Preserve voice/text drafts, offline capture and retry safety. Show short receipts containing actual confirmed changes and unresolved work.
- Keep external sends, contractual commitments and sensitive changes behind the appropriate human approval.

Finish criterion: one conversation can produce coherent, auditable progress across existing records, without duplicate work or fabricated certainty.

## 5. Documents and commercial execution

- Connect existing representation agreements, mandates, player pitches, invoices and scouting reports to the relevant business workflow.
- Let a new player or outside party be a document subject without becoming a signed roster player.
- Reuse tenant branding and template settings consistently across editor, preview, editable Word output, PDF and club-facing links.
- Reduce repetitive entry using existing approved player, agency, club and contact facts; keep clauses, dates and commercial terms easy to review and edit.
- Tie document creation, review, approved sharing and subsequent follow-up to the relevant player/opportunity/contact.
- Distinguish actual provider-backed delivery, open, signature or payment events from manual status updates. Do not imply integrations or tracking that have not been proven.
- Verify real exported files, pagination, long names, missing fields and mobile recipient experience.

Finish criterion: a professional document is accurate, editable, branded, connected to its purpose and easy to follow through after creation.

## 6. A product another agency can adopt confidently

- Validate a fresh agency from invitation and branding through imports, staff responsibility and the first useful player/club workflow.
- Reconcile the recorded backend-contract gaps with actual deployed call sites. Repair the existing scheduled review-job failure and investigate reproducible network failures.
- Review the existing security findings deliberately, with role and tenant-isolation tests.
- Validate connected email, Calendar and other supported providers with actual authorised accounts; fixture tests are not provider acceptance.
- Test realistic data volumes, staff roles, revoked access and new/returning sessions.
- Make provider connection state, recovery, costs and operational health understandable to the appropriate agency/platform operator.

Finish criterion: a second agency can become productive with its own identity, data and staff without developer intervention or hidden broken setup paths.

## UI cleanup is a first-class workstream across every milestone

### Page and information hierarchy

- Home, Players, Recruitment, Profile, work view, Opportunities, Network, contact/club detail, Calendar, Tell, Documents, onboarding and settings.
- One clear primary action for the current job; quiet secondary actions and progressively disclosed administrative controls.
- Reduce repeated helper text, generic badges, oversized empty cards, redundant headings and ambiguous status labels.
- Give rosters and work lists useful density and scanability without making mobile targets cramped.
- Keep player identity, terminology, statuses and source meaning consistent between every surface.

### Shared components and interaction behaviour

- Standardise typography, spacing, colour meaning, tenant branding, buttons, icons, menus, forms, tables and feedback.
- Check every drawer, modal, popover, editor and preview with long content, validation errors and small screens.
- Keep headers and action areas usable, content scrollable, background scrolling controlled, focus visible and keyboard dismissal predictable.
- Preserve drafts and scroll position where appropriate. Keep stale responses, duplicate submissions, confirmed saves, Retry and Undo behaviour correct.
- Make loading, empty, permission-denied and failed states truthful and useful. Measure speed rather than treating a spinner as sufficient feedback.

### Mobile and accessibility

- Verify the key jobs at 320, 390, 768 and 1440 pixels, plus a physical iPhone/Safari pass.
- Check safe areas, software keyboard behaviour, horizontal overflow, long names, text zoom and overlay stacking.
- Keep primary actions, footage, contact and capture controls easy to reach and tap.
- Measure contrast and inspect labels, reading order, focus management and keyboard-only completion.

Finish criterion: every touched workflow is coherent and usable across its normal, loading, empty, error, editing and small-screen states. UI acceptance belongs to each release, not a final cosmetic sweep.

## Delivery order

1. **Daily agency experience:** shared UI foundations, meaningful Home/Players priorities, player-data clarity and the highest-impact recorded reliability fixes.
2. **Player-to-club execution:** profile readiness, existing sharing, Opportunities/Network continuity and Tell-driven follow-up, with their deep-page and mobile cleanup.
3. **Documents and commercial follow-through:** the five existing document types, new-player subjects, tenant branding, real output quality and honest tracking.
4. **Independent agency proof:** fresh-agency onboarding, actual providers, staff roles, realistic volumes, physical-device acceptance and remaining cross-platform UI inconsistencies.

Each release should leave a complete, useful workflow. Avoid a single oversized rewrite or half-finished parallel implementations.

## Evidence that the programme worked

Run representative cases with agency staff: a new player joining, a club request progressing to a player discussion, a conversation becoming accountable work, a contract deadline being handled and an invoice being followed through. Include another agency and a mobile user.

Measure time to complete those jobs, repeated entry, manual corrections, missed follow-ups, successful recovery, role/tenant safety and recurring weekly use. Establish baselines and targets before claiming improvement.
