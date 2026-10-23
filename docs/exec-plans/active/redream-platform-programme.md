# ReDream platform programme: authoritative execution plan

Owner: Codex, requested by Jesse Edge on 23 October 2026.
Status: active. The whole programme remains open.
Working branch: `codex/redream-platform-programme`.
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
- Next exact action: PLY-02, clarify the existing club headline-stat mode, source/season context and intentional custom overrides without changing any saved statistics. Then DAY-02 Home priority quality and TELL-05 whole-loop acceptance.
- Local checkpoint: 1,965 tests pass, TypeScript passes and the new actual-component roster check passes at 320/390/768/1440. Full CI, review and hosted acceptance are pending; the whole programme remains active.
- Production: no new programme changes deployed. Prior release permission does not silently authorise unrelated destructive actions or external sends.

## Full execution register

| ID | State | Depends on | Outcome | Acceptance |
| --- | --- | --- | --- | --- |
| GOV-01 | validated | None | Track the complete agreed programme | This committed plan, explicit UI matrix and AGENTS resume pointer retain every workstream. |
| GOV-02 | active | GOV-01 | Verify and reuse existing capabilities | Record gaps and existing evidence per item before implementation; completed hardening is retained. |
| DAY-01 | implemented | GOV-02 | Truthful player priorities | Specific existing actions, overdue work and setup gaps are distinguishable; a missing optional action is not an urgent warning. |
| DAY-02 | todo | DAY-01 | Useful personal Home | Assigned work, material deadlines and low-priority reviews have clear priority and reasons; preserve current staff visibility. |
| DAY-03 | todo | DAY-02, TELL-02 | Consistent completion and ownership | Completion, reassignment, snooze and Undo reconcile across Home, Calendar, player/contact and capture receipts. |
| PLY-01 | todo | GOV-02 | Player and prospect lifecycle | Discovery, recruitment, representation and ongoing management use existing models; prospects never become signed players accidentally. |
| PLY-02 | todo | GOV-02 | Understandable football statistics | Period, club, source, freshness and custom scope are clear; zero stays zero and deliberate overrides survive. |
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
| OPS-01 | todo | GOV-02 | Recorded backend contract reconciliation | Review all 11 recorded absent contracts against deployed call sites; repair required flows with scoped reviewed changes, not permissive wrappers. |
| OPS-02 | todo | GOV-02 | Background change-review repair | Reproduce and fix the existing queue_change_review_items tenant guard failure without cross-tenant routing or blanket bypass. |
| OPS-03 | todo | GOV-02 | Observed timeout follow-up | Investigate the recorded server network timeout; distinguish reproducible application failures from isolated transport errors and verify recovery. |
| OPS-04 | todo | GOV-02 | Security findings review | Review existing security-definer, GraphQL and password-protection findings deliberately; retain tenant/role allow-and-deny evidence. |
| OPS-05 | todo | OPS-01 | Hosted migration parity | Relevant staging/production contracts and selected grants match reviewed release requirements; preserve historical ledgers and exclusions. |
| SAS-01 | todo | OPS-01 | Fresh agency onboarding | New agency branding, owner setup, first useful record and first working business journey succeed without developer intervention. |
| SAS-02 | todo | SAS-01 | Imports and responsibility setup | Record mapping, duplicate handling, staff invitation, memberships and player/task responsibilities work for a new agency. |
| SAS-03 | todo | OPS-01 | Real provider acceptance | Authorised email, Calendar and other supported providers demonstrate connect, read, permission expiry and recovery; fixtures are labelled honestly. |
| SAS-04 | todo | OPS-04 | Role and volume acceptance | Owner/admin/agent/operations/read-only/player and revoked access are verified at representative record volumes without privacy regressions. |
| SAS-05 | todo | SAS-01, DOC-06 | Consistent tenant identity | Agency branding carries through private workspace, external profile, documents and relevant communications without DJM-specific bypasses. |
| UX-01 | todo | GOV-02 | Shared hierarchy and density | Headings, primary actions, quiet secondary controls, useful list density, badges and empty space are coherent across the page matrix. |
| UX-02 | todo | UX-01 | Shared visual language | Typography, spacing, colour meaning, icons, menus, buttons, fields, tables and feedback follow existing tenant-aware design tokens. |
| UX-03 | todo | UX-02 | Overlays and long forms | Drawers/modals/popovers/editors scroll correctly with long content; headers/actions remain reachable and stacking is correct. |
| UX-04 | todo | UX-03 | Keyboard and draft safety | Focus, Escape, keyboard-only completion, unsaved drafts, confirmed writes, failed refreshes and Undo remain correct. |
| UX-05 | todo | UX-01 | Loading and recovery | Cold/warm reads, empty/error/permission states, stale requests, retries and duplicate submissions are clear and bounded. |
| UX-06 | todo | UX-01 | Mobile and accessibility | 320/390/768/1440 widths, text zoom, contrast, names, keyboard, safe areas and physical iPhone/Safari acceptance are recorded honestly. |
| UX-07 | todo | UX-05 | Measured speed | Establish and compare complete-job timings, cold/warm loading and bundle limits; measure rather than claim speed from a screenshot. |
| VAL-01 | todo | DAY-03, TELL-05, DOC-07 | Five real working cases | New player joining, club request, conversation-to-work, contract deadline and invoice follow-through have end-to-end evidence. |
| VAL-02 | todo | SAS-04, UX-06, VAL-01 | Independent agency acceptance | Another agency and mobile staff use the existing product; record time, repeated entry, corrections, missed follow-ups and recurring use. |
| RELSE-01 | todo | All programme acceptance items | Final programme acceptance | All required product and UI rows have current evidence, checks pass and deployment/production acceptance follows current user authorisation. |

## UI coverage matrix: required throughout the programme

For each row inspect the relevant shared primitives and record accepted evidence for: normal content; long/empty content; loading/error/retry; allowed/denied permissions; editing/draft/confirmation; overlays/scroll/focus; 320/390/768/1440 widths; accessibility and physical-device checks where applicable. Use explicit not-applicable reasons where a state truly does not exist. A shared-component fix does not automatically accept every page.

| ID | Page / workflow | State | Evidence / remaining |
| --- | --- | --- | --- |
| UI-01 | Home / agency overview | todo | Full required state coverage not yet recorded for this programme. |
| UI-02 | Players roster | active | DAY-01 fixture: specific/setup/private/undated/future work, action routes, four widths, 44px targets and card-internal clipping passed. Full state matrix, keyboard/contrast and physical-device acceptance remain open. |
| UI-03 | Recruitment list / detail / creation | todo | Full required state coverage not yet recorded for this programme. |
| UI-04 | Player Profile / preview / sharing | todo | Full required state coverage not yet recorded for this programme. |
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
| UI-17 | Public / token-shared club profile and document recipient | todo | Full required state coverage not yet recorded for this programme. |

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
