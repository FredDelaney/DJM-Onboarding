# ReDream platform audit, 21 October 2026

## Scope and evidence rules

This checklist records current source, observed defects, implemented repairs and separately identified test layers. A route entry is an inventory item, not a claim of complete testing. Synthetic Chromium fixtures intercept services; they do not establish provider accounts, physical-device behaviour or live backend correctness. Physical iPhone/Safari and unavailable role/provider accounts remain explicitly outstanding.

Source baseline: `fe061994f0e3c4291def9d0d32e383e5edcfca18`, refreshed from origin/main. Both production projects were READY on that commit: DJM `dpl_4jY88teN2DDknxyg7TmcJxPmJFsN` and ReDream `dpl_BQBzAw5xNMU8DoRLQhY4ngj5gEoF`. PRs 245/246/247 are merged. Open PRs 174/199/201/231 were inventoried; their older implementations are not blindly substituted for main.

## Findings and acceptance log

| ID | Surface / role | Kind / severity | Reproduction / baseline | Change | Verification |
|---|---|---|---|---|---|
| INV-01 | Staff registration, prospective agency staff | Reproduced source drift / high | Archive backend source absent from main; live stage v6/prod v13 contain it | Restore canonical handler + 3 historical migrations, preserve deployed repair | Both live bundle hashes `3c038c1f4eea50e67ab116569059b8c2840e40499979209561070547b79d6a10`; local handler byte-identical. All three canonical ledger versions and trigger markers present in both DBs. No backend replay/deploy required |
| INV-02 | Staff join, existing account | Reproduced frontend failure / high | HTTP 409 FunctionsHttpError hides account_exists, generic failure instead of sign-in | Structured error parser and existing-account recovery from archive | Focused helper/handler/DB tests; browser acceptance recorded below |
| INV-03 | Staff join, invitation expires after opening | Reproduced contract gap / medium | Backend returns HTTP 200 with invite:null; old code continues as if registration succeeded | Require explicit ok:true; recognise inactive invitation; preserve form; sign-in exit | Regression helper test + simulated browser expiry during submit |
| INV-04 | Staff join, all users | Reproduced accessibility/recovery gap / medium | Imported browser test failed: visible join-message had no alert role; wrong-account sign-out failures had no visible message | Accessible alerts, wrong-account sign-out error/retry state, inactive-link exit | Final browser regression |
| HOME-01 | Today/Home, agency staff | Reproduced loading delay / high | Local Chromium, intercepted stalled home_focus and fallback; 24,134 ms before recovery | One 12-second budget; preferred read yields to fallback at 3 seconds; warm reads share a 3-second budget | Same controlled browser probe: 12,448 ms; focused deadline/fallback/late-result tests |


| INV-05 | Actual Auth INSERT, new staff, staging | Reproduced backend wiring defect / high | First live canary got membership but no profile; HTTP 200 profile PATCH returned zero rows. Staging had no custom Auth INSERT trigger, despite the repaired function being installed | Add guarded missing-trigger migration. Applied to staging only; production canonical trigger already healthy | Repeated new/existing staff canary: exactly one profile row updated; neutral global role, renamed active team identity, two exact memberships, no player rows/token. All QA identities/agencies/invitations removed, verified zero. Real PGlite tests cover missing/healthy/disabled/unexpected wiring |
| BRAND-01 | Workspace sidebar/mobile/profile fallback, staff | Reproduced identity mismatch / medium | Signed-in Northstar page labelled Workspace on generic staging host; host runtime did not identify selected agency | Use authorised selected-workspace branding; never borrow another host tenant's assets | Two focused tests including unresolved/different/same host; real workspace browser checks for desktop/mobile labels; hosted preview acceptance is recorded in the PR |
| DATA-01 | Player statistics, staff | Reproduced unexplained disabled action / medium | Marcus Bell has club/competition but no current season. Update statistics disabled with no title/description; reason hidden in Sources and history | Show exact missing context beside action, associate accessible description, retain existing sourced manual editor | Missing-context browser assertion before disclosure, manual editor, read-only, conflict and five-width coverage |
| LINK-01 | Club need to Opportunities and Home expiry review | Reproduced lost-record navigation / medium | Work need opened generic Opportunities. Home need-expiry Review omitted the record too. September staging needs are now expired and therefore absent from live demand summary | Preserve club_need_id and active workspace in both existing handoffs, allowing the existing exact-record reader to resolve it | Club callback regression plus actual Home link assertion and existing beyond-summary exact-record tests |
| VIEW-01 | Shared task confirmation, mobile | Reproduced clipping during resize / medium | Initial exact-head CI failed the unchanged 320 x 480 fit assertion. Holding the previous visualViewport height while resizing reproduces locally | Bound confirmation backdrop with native 100dvh, independent of lagging JS viewport state; retain keyboard viewport handling | Same fault-injection and unchanged geometry assertion fail before, pass after. Full Calendar actions plus long-confirmation/native-dialog/focus/scroll regressions pass |
| PDF-01 | Hosted PDF export, agency staff | Reproduced production-policy failure / high | Word downloaded, but PDF displayed WebAssembly CompileError on hosted staging; development's unsafe-eval allowance had concealed the problem | Add the specific wasm-unsafe-eval script capability while continuing to exclude JavaScript unsafe-eval in production | New actual-export regression under production Next headers fails before the fix with the exact hosted error, then downloads a valid PDF after. It is included in platform-polish browser CI; hosted repeat is recorded in the PR |
| ENV-01 | Connections, staging staff | Verified environment limitation / medium | Live drawer reports absent public.redream_provider_connections(); staging has neither function nor 20260926122729 provider foundation ledger entry | No blind historical replay, provider setup or configuration mutation in this release | Production reader and provider foundation ledger are present. Live stage provider-account acceptance remains blocked on deliberate reconciliation of the provider foundation and its later dependencies |
| ENV-02 | Settings on generic staging alias | Verified host/access limitation / medium | Settings/team resolves to Workspace unavailable: generic Vercel host is not a tenant domain | Explicit workspace pages remain usable; selected-workspace branding repaired separately | DB confirms verified northstar-football-management.staging.redreamsystems.com. A signed-in session on that tenant host is required for live Settings/role acceptance; no customer access widened |

## Staff backend acceptance, isolated staging only

Two new empty QA agencies and one disposable staff account exercise live Auth/Edge/SQL contracts. No customer agency membership, password or role is changed and no email is sent. HTTP results: new registration 200, password sign-in 200, wrong-account acceptance 403, existing-account registration 409, exact second-agency acceptance 200, profile save 200, workspace membership listing 200, logout 204. Expired/revoked/used preflight returned no active invitation. SQL acceptance confirms two exact memberships (admin, agent), a neutral global profile, active renamed team identity, zero player rows and no retained invitation capability. Cleanup SQL confirmed zero remaining QA users, QA tenants and invitations. The initial incomplete profile canary was removed too. Temporary credential files were deleted. HTTP 200 alone was not accepted as proof: the passing repeat required a returned owned profile row and SQL assertions. No production signup was performed in this audit.

## Route inventory

62 page entry files were enumerated. Query views, drawers and role surfaces follow in a separate matrix. `Mapped` means source inventory only until an evidence entry establishes execution.

| Route | Source | Surface / role | Coverage status |
|---|---|---|---|
| `/brain/benchmarks/import` | `app/(djm-os)/brain/benchmarks/import/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/brain/data` | `app/(djm-os)/brain/data/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/brain` | `app/(djm-os)/brain/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/brain/performance` | `app/(djm-os)/brain/performance/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/deals` | `app/(djm-os)/deals/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/djm` | `app/(djm-os)/djm/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/market/deals/[id]` | `app/(djm-os)/market/deals/[id]/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/market` | `app/(djm-os)/market/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/network/clubs/[id]` | `app/(djm-os)/network/clubs/[id]/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/network/contacts/[id]` | `app/(djm-os)/network/contacts/[id]/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/network` | `app/(djm-os)/network/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/opportunities/[id]` | `app/(djm-os)/opportunities/[id]/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/opportunities` | `app/(djm-os)/opportunities/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/recruitment/[id]` | `app/(djm-os)/recruitment/[id]/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/recruitment` | `app/(djm-os)/recruitment/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/scout` | `app/(djm-os)/scout/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/settings/agency` | `app/(djm-os)/settings/agency/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/settings/billing` | `app/(djm-os)/settings/billing/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/settings/connections` | `app/(djm-os)/settings/connections/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/settings` | `app/(djm-os)/settings/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/settings/player-experience` | `app/(djm-os)/settings/player-experience/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/settings/preferences` | `app/(djm-os)/settings/preferences/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/settings/profile` | `app/(djm-os)/settings/profile/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/settings/security` | `app/(djm-os)/settings/security/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/settings/team` | `app/(djm-os)/settings/team/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/tell` | `app/(djm-os)/tell/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/product` | `app/(redream-public)/product/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/security` | `app/(redream-public)/security/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/support` | `app/(redream-public)/support/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/switch` | `app/(redream-public)/switch/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/activate/[tenantSlug]` | `app/activate/[tenantSlug]/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/admin` | `app/admin/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/admin/players/[id]/compare` | `app/admin/players/[id]/compare/page.tsx` | Staff / invited staff | Compatibility redirect, source mapped |
| `/admin/players/[id]` | `app/admin/players/[id]/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/agency` | `app/agency/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/career` | `app/career/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/check-in` | `app/check-in/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/connections` | `app/connections/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/cv` | `app/cv/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/documents` | `app/documents/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/forgot-password` | `app/forgot-password/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/home` | `app/home/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/inbox` | `app/inbox/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/join/[token]` | `app/join/[token]/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/launch` | `app/launch/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/onboarding` | `app/onboarding/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/p/[slug]` | `app/p/[slug]/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/` | `app/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/platform/join/[token]` | `app/platform/join/[token]/page.tsx` | Platform operator | Mapped; execution evidence below |
| `/platform` | `app/platform/page.tsx` | Platform operator | Mapped; execution evidence below |
| `/platform/sign-in` | `app/platform/sign-in/page.tsx` | Platform operator | Mapped; execution evidence below |
| `/player-workspaces` | `app/player-workspaces/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/privacy` | `app/privacy/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/profile` | `app/profile/page.tsx` | Player / invited player | Mapped; execution evidence below |
| `/reset-password` | `app/reset-password/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/s/[token]` | `app/s/[token]/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/sign-in` | `app/sign-in/page.tsx` | Public / recipient | Mapped; execution evidence below |
| `/workspace/[tenantSlug]/capture` | `app/workspace/[tenantSlug]/capture/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/workspace/[tenantSlug]/documents` | `app/workspace/[tenantSlug]/documents/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/workspace/[tenantSlug]/documents/view/[token]` | `app/workspace/[tenantSlug]/documents/view/[token]/page.tsx` | Exact public recipient token | Mapped; execution evidence below |
| `/workspace/[tenantSlug]` | `app/workspace/[tenantSlug]/page.tsx` | Staff / invited staff | Mapped; execution evidence below |
| `/workspace/join/[token]` | `app/workspace/join/[token]/page.tsx` | Staff / invited staff | Mapped; execution evidence below |

## Workspace query views and overlays

| Surface | Role | Execution evidence / current status |
|---|---|---|
| Home / Today, owned/shared priorities, completion/reopen/reschedule/Undo, meetings, review items | owner/admin/staff as authorised | Existing home-work, responsibility, review-context and work-brief fixtures; real staging owner Home reads passed; five existing priorities and exact player routes checked without completing customer work |
| Players list/profile/editor, image picker, statistics, sources, career, profile preparation and comparison redirect | staff with player access | Workspace/profile/player-data/profile-preparation browser fixtures; live staging owner directory/profile/contact editor opened; photo and statistics remained unknown where missing; physical photo picker remains outstanding |
| Recruitment list/prospect/editor and exact deep links | authorised staff | Workspace find-flow, record-clean and pursuit fixtures |
| Network people/clubs/contact details/editor/history/communication links | authorised staff | Live Northstar club list/details/need handoff and contact routes inspected; contact details/editor, find-flow and pursuit fixtures passed. Physical app return remains outstanding |
| Opportunities needs/matches/routes/deals/negotiation/closeout/history/service review | owner/admin; permitted staff views | Deep-pages and deep-journey fixtures; no real external communication or commercial mutation |
| Calendar dated/undated work, meetings/drawer/assignment/timezone/provider state | authorised staff | Live month/empty-day/Add task form/cancel checked; Calendar, responsibility and recovery fixtures passed. No live task saved; actual provider sync outstanding |
| Tell/Ask text/voice, receipt/review, ambiguous choice, retry, dismissal/Undo, private editable handoff | authorised Tell users | Tell-work, preparation and agent/work-brief fixtures. Physical microphone/transcription remains outstanding |
| Documents 5 templates, general/club-specific profile, AI assistance, draft/preview/export, recipient link and invoice tracking | owner/admin; exact approved recipient | Document/profile fixtures; live tenant library and unsaved prospective-player pitch editor opened; Word/PDF render review below; no customer publish/send |
| More / settings: profile/preferences/security/team/agency/billing/connections/player experience | authorised staff; owner/admin for restricted actions | Settings fixture coverage passed. Live generic-host Settings blocked by ENV-02; Connections reached truthful failed read/retry and unavailable messaging state (ENV-01), not Connected/Synced |
| Platform control plane, signup/activation, imports | platform administrator | Existing platform-polish tests; unavailable private live screens remain untested |
| Player portal Today/Career/Check-in/Inbox/CV/documents/connections/account | own player | Player-entry fixtures; no customer player impersonation |
| Recipient/public player profile, reviewed snapshot expiry/revocation and private-field boundary | unauthenticated exact token | Existing SQL/handler/document tests; no current customer share is published or modified |

## Backend, workflow, export and operational evidence

- Rolled-back live staging assertions passed for exact tenant, exact synthetic player brief, foreign-player denial, unavailable-workspace denial, authorised document read, invalid recipient-token denial, anonymous editor/brief grants denied, non-member document denial and unauthenticated brief denial. They read no private content into the report and committed no data.
- Existing regression fixtures passed for conversation objective completion, ambiguity/negation/future work, approval, sourced outcomes, separate follow-ups, idempotency/Undo and revision conflicts. Ask work briefs retain deterministic reads, explicit-name scope, live source links and editable preparation handoffs. These are fixture/SQL results, not a new real model/transcription canary in this audit.
- Document database fixtures cover immutable reviewed snapshots, expiry/revocation, tenant boundaries, private-field exclusion, manual payment truth and currency/missing-value semantics. No document was published or sent during this audit.
- Fresh browser exports: all five templates under Northstar and Atlas branding, including accented name Łukasz Zieliński; additionally a 30-line Northstar invoice. All 22 actual exports were rendered with bundled LibreOffice/Poppler and inspected using all-page contact sheets plus full-size contract/scouting/invoice pages. Automated PDF text checks passed names/agency isolation, non-empty pages, text bounds, scouting source URL, all 30 invoice rows and correct EUR 2,500 / EUR 3,750 totals. No clipping or broken tables observed in those samples. Contract pagination differs legitimately by renderer: DOCX 4 pages, generated PDF 5; mandate 2/2, pitch 6/6 landscape, invoice 1/1, scouting 1/1, long invoice 3/3. These samples do not certify arbitrary future wording or legal validity.
- Hosted first-build acceptance confirmed Northstar branding, both exact need handoffs and visible missing-season guidance. Desktop Chromium 1459 x 699, existing owner session: first Network 476 ms, Players 463 ms, profile 1,197 ms, repeated profile 220 ms, Find query 1,008 ms, Tell reload to authorised controls 1,187 ms. Single samples include automation overhead; these are not mobile/network benchmarks. No note was submitted or interpreted. Hosted Chromium at 390 x 844 also confirmed mobile navigation, zero Home overflow, correct workspace label and the More sheet. Unsaved-document Keep editing preserved the test name; Discard changes removed only the unsaved synthetic draft and the live library stayed empty. Hosted Word download was validated from the actual file. The first hosted PDF failed with PDF-01; the production-policy regression now passes and the fixed hosted build downloaded a valid 34,687-byte, six-page PDF with the correct synthetic identity and tenant. File write completed approximately 3,163 ms after the click timestamp in one desktop sample. This is not a general export-speed guarantee.
- CSP rationale: the PDF layout engine compiles WebAssembly. [MDN script-src documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src) distinguishes wasm-unsafe-eval from JavaScript unsafe-eval. The other CSP directives, origins and production JavaScript-eval restriction remain unchanged.
- Local evidence files: /tmp/redream-platform-export-audit/report.json and text-audit.json, four all-page contact sheets and individual page PNGs; /tmp/redream-home-loading-before.json and after.json; staff canary report at /tmp/redream-staff-audit-CfwXoD/report.json. They contain synthetic identities/results, not retained passwords/tokens.
- Runtime monitoring: both production projects returned no grouped runtime errors over the refreshed 24-hour window. Capture pending states older than a day and running football jobs older than an hour were both zero under the explicitly queried states. Staging captures: 7 done, 1 needs_input; production: 20 done, 1 partial, 1 resolved, 2 processed, 1 needs_review. Needs-input/review is not a completed-work claim. No capture contents were printed or changed.
- Football enrichment queue is not proven healthy by those running-state counts: staging has 11 queued, production 21 queued, oldest production update 7 September with maximum one attempt. Production football/player refresh cron entries are enabled, but this does not establish successful execution, licensed provider access or fresh statistics. Queue/provider reconciliation remains a specific service acceptance requirement; no bulk refresh, model spend or customer evidence rewrite was triggered.
- Home timing: same desktop Chromium fixture/network interception, 24,134 ms before to 12,448 ms after. This is bounded recovery timing, not a real mobile network speed claim. No new AI calls or dependencies added. The final workspace gzip measurement is recorded below.

## Outstanding device, account and service acceptance

- Physical iPhone Safari: safe areas/browser bars, real keyboard reachability, photo picker, microphone permission/recording/transcription, PDF download/share, WhatsApp/email return.
- Separate authorised WhatsApp Business and Instagram accounts with Meta eligibility and approved scopes; email/calendar OAuth accounts for actual ingestion, cancellation/reconnect/expired scopes and per-colleague isolation. Fixtures cannot establish these.
- Licensed Wyscout configured access; real API-Football competition/season coverage, quota and freshness. A saved Transfermarkt URL is reference data, not a verified automated feed. Do not expose credentials in audit output.
- Live platform-operator and player roles that are not available to the active staging account; a tenant-host staff session for Settings and a reconciled staging provider foundation for Connections. Keep those checks outstanding rather than broadening an existing customer account.

## Release manifest and rollback

Restore `20261021043725_repair_staff_invite_signup.sql`, `20261021044635_repair_staff_invite_auth_insert_order.sql`, `20261021045301_preserve_staff_membership_on_profile_save.sql` to source. They already exist canonically in both live ledgers: do not replay them. The reconciled agency-staff-invite-public handler already matches both live workers. No worker deployment, secret or Supabase configuration change is needed. The new `20261021170117_restore_auth_signup_trigger_wiring.sql` was applied to staging and its ledger aligned to that canonical version after exact source-hash verification (54be7fdd1715a5537b3a0cb02137113e). Production already has the enabled canonical trigger, so it needs no trigger replacement; the guarded migration returns without changing a healthy trigger. Do not replay the three historical repairs. Do not bundle the unrelated provider foundation into this release. Deploy the frontend from a validated preview only through the existing release gate. Roll back the frontend to the previous READY deployment if necessary; preserve the working backend repair. The staging wiring repair creates only the previously missing trigger and changes no existing account. Do not drop the recovered trigger during frontend rollback, which would recreate the signup defect. A backend rollback requires explicit review of actual wiring and function state. The excluded relationship-entrypoint migration is unrelated.

## Final verification

The broad local `npm run check:browser` completed successfully. Final affected browser checks were rerun after the last source changes: workspace deadlines/Retry/stale cache/branding/Home exact need link, player data and club/contact/deal details. `npm run check` passed: 1,913 tests, TypeScript including fixture projects, production build and workspace bundle 145,513 gzip bytes (150,000 budget). The subsequent hosted PDF defect also has a failing-before/passing-after production-export test. Exact-head CI/preview are recorded in the pull request. Its verify and browser_journeys gates must both pass on the actual head before merge. Physical-device/provider/private-role limitations above remain outstanding regardless of green fixtures.

Backend status: the three staff repairs and worker were already live and have been reconciled to source; one missing Auth trigger was restored in staging only. Production was read-only. Frontend status: implemented in this review branch, not merged or deployed to customer production by this audit. The PR records the exact validated commit and preview; a successful preview is not evidence of a production release.
