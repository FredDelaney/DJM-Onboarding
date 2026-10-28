# Club-request commercial brief

Programme: REL-01 / REL-02 / UI-06. This is the first commercial-intake increment, not acceptance of the complete request-to-deal workflow.

## Problem and reused implementation

The existing Add club need form and `agency-os` route carried only club, country, position, title, notes and expiry. Deployed `club_needs` already had salary, currency, period, tax basis and transfer budgets, but the form did not write them and the workspace did not display or edit them. Contract/option months and explicit source verification were absent. Creation also required a legacy global team row. Actual staging had no public `redream_entity_patch` wrapper, so the generic editor's nominal RPC could not establish a working hosted edit.

Reuse: the existing drawer, saved/uncertain-save recovery, organisation reuse, canonical `club_needs`, operator/admin membership helpers, demand/exact read models, entity patch/audit writer, opportunity candidate/career controls and existing browser/PGlite infrastructure. No parallel request, player, matching engine, form framework or dependency is introduced.

## Delivered behaviour

- Minimum-first creation retains club, position and original wording. Budget, contract, availability and source fields are one optional native disclosure, with no default currency, period, tax basis or guarantee.
- Shared typed fields expose maximum salary and transfer budgets, currency, weekly/monthly/annual period, gross/net/unknown basis, initial months, separately declared guarantee, optional months, transfer preference, availability and confirmed/reported/unverified source status.
- Decimal-string validation reuses the frozen currency minor-unit table. Exact integer arithmetic distinguishes a €5,000 monthly budget, €60,000 annualised over 12 paid months, a 12-month initial budget and a separate optional extension budget. Weekly annualisation explicitly uses 52 weeks; no weekly-to-monthly term estimate is invented. These are request ceilings, never promised earnings, agreed contract value or agency commission/revenue. No exchange or tax conversion occurs.
- A versioned create action rejects older backends instead of losing detail. Confirmed creation opens the exact tenant-scoped request. Unknown/malformed acknowledgements retain the existing no-blind-resubmission recovery.
- Both read models return exact decimal strings and private request/source fields. The existing editor reuses the same definitions. A narrow authenticated club-only RPC delegates to the existing entity writer after active admin/request-tenant, row-lock, expected-version and field checks. Failed edits retain drafts; stalled/unconfirmed edits offer reload/reopen rather than claim success or permit blind replay. Original wording is retained while the current brief changes. Date-only expiry retains the whole valid-until day.
- The wider absent generic edit/archive wrappers remain a separate unresolved gate; no broad generic public API is restored here. Staff roles admitted to this existing workspace are unchanged.

## Database manifest

Staging **ltvmopvarlnidiozvpow only**, installed ledger version **20261028165458**, name `club_request_commercial_brief`:
`supabase/migrations/20261028165458_club_request_commercial_brief.sql`.

The CLI allocated the initial file; it was renamed to the actual applied ledger timestamp without changing SQL bytes. Do not apply it again. Do not replay historical migrations or use blind `db push`. In particular, never execute `20260930142119_restore_redream_relationship_person_entrypoint.sql`.

Five nullable columns on `djm_os.club_needs`: `contract_months`, `contract_guaranteed`, `option_months`, `availability_notes`, `source_status`. Existing rows remain unknown, with no backfill. The existing owner FK changes identity target from `djm_os.team_members(user_id)` to `auth.users(id)`, retaining SET NULL; canonical agency authorisation remains in the writers. No RLS/table grant/configuration change.

Guarded body changes preserve existing OIDs, owners, grants, volatility, search paths and all unrelated branches:

| Function | Previous body MD5 | Installed body MD5 |
| --- | --- | --- |
| `platform_server_agency_create_club_need` | `1c7617baa8d5de760df3a68ef96061df` | `71def288854195f8827a36ed173e5abb` |
| `djm_entity_patch_v1` | `e4ab149c21986cf3bff7f0cdc70a5522` | `5fb601fe896dd5702935db1772323001` |
| `platform_server_workspace_need_record` | `8f0945f944b139dad84bab5b3b8d30aa` | `c04c6ecbdf94df2d0ebb30e7bed46b20` |
| `platform_server_demand_control_fast` | `302e31bcb9c0e9ee6fc1a65f08bb0ff7` | `7fde3806aa6da4f17f2e91521cede813` |

New functions: private invoker helper `platform_club_need_brief_patch` (`faf7f16d83256c2e8a5b34b62e3710cd`, owner-only); service-only `platform_server_agency_create_club_need_brief` (`0c5fcd622de2c2a7683baee7cd1ad5f6`); authenticated/admin-scoped `redream_club_need_patch` (`f8ade62847f20b192b43e23a75269f0a`). Fixed empty search paths; no client-supplied actor in the browser RPC. The currency helper and two existing operator/club helpers are unchanged.

The security advisor adds exactly the expected authenticated-callable SECURITY DEFINER notice for `redream_club_need_patch`. Its grant is deliberate: the browser wrapper performs current identity, active agency admin, exact request workspace and record/version checks before delegating to a service-only writer. Actual authenticated role canaries pass. No other security finding or performance finding is added. Reference: [Supabase function-execute guidance](https://supabase.com/docs/guides/database/functions#function-privileges).

## Validation and rollout checkpoint

- Focused model/database tests cover null versus zero, currency precision, explicit arithmetic assumptions, malformed/unknown fields, transactional rollback, create/edit/list/exact reopen, source retention, partial patches, stale/versionless edits, expiry and role/tenant/disabled access. Frozen test fixtures document the actual pre-migration contracts; they are never deployable migration input.
- Existing create and opportunity journeys cover four widths, keyboard disclosure, visible Save in short viewports, failed-edit draft retention and unknown-outcome reload. The earlier e4c45b0 CI failure was an SSR/hydration race: its test pressed Enter after SSR visibility but before the fixture's readiness effect. The same test now waits for the existing `data-qa-ready` signal; no production interaction is altered for that failure.
- Actual hosted rollback-only canary: `docs/operations/sql/redream-club-request-brief-canary.sql`. Fresh verified-invite identity, no global staff, create/list/exact reopen, reported source remaining unverified, edit, original retention, stale timestamp, wrong role/workspace and invalid/foreign-create rejection pass. Every synthetic row is rolled back.
- Original staging projections before and after match: 5 needs hash `a41a551a7388f1f5ce1629a5d41f8052` (excluding only newly added nullable columns), 5 organisations `4d94c9a9c83202b09c50a7a7bf851aeb`, 83 events `fbdb83a9478d5d07c94f3fe490a215c1`; audit count remains 151. This is scoped evidence, not a claim of whole-database immutability.
- Full `npm run check` passes 2,212 tests, all TypeScript projects, production build and workspace bundle budget. The focused create journey and extended real opportunity editor journey pass at 320/390/768/1440, including failed-edit draft recovery and a real 12-second uncertain-write deadline with no blind resubmission. Phone/desktop images are inspected. Final versioned-editor opt-in and spacing changes pass 44 affected contracts, the four-width opportunity journey, all TypeScript projects/build again, with final gzip 146,126 / 150,000 bytes. Unrelated entity editors do not acquire the new versioned acknowledgement requirement. Local logs/screenshots are in `/tmp/redream-platform-programme/club-brief-*` and `club-commercial-brief/`.
- Edge manifest: staging `agency-os` **version 63 ACTIVE**, id `4d095c51-3f65-4f3f-9ab3-18f8f4f50c65`, bundle SHA-256 `0ec75f44698bff7658579b2692e2f5d3f30e51550db4511b9720d26073c5da3e`. All eight hosted files are re-read and match the local closure. Only `agency-os/index.ts` changes from installed version 62; all seven relative dependencies are unchanged. `verify_jwt=true`, no import map, preserved. An unauthenticated request returns HTTP 401. This verifies source and the rejection boundary, not authenticated browser acceptance of the new create route. The versioned API is installed before exposing this frontend. No provider, secret, schedule or production change is included.
- Frontend: consolidated draft PR 281 only. New hosted owner/browser, independent-agency and physical-device acceptance is still required. Do not promote or merge while final CI or required rollout checks are outstanding. Production is untouched.

## References and next gates

Public reference patterns informed the choice to connect existing records rather than add a framework. [TransferRoom requirements](https://knowledge.transferroom.com/how-to-create-a-player-ad-new) make football requirements and differently expressed commercial budgets explicit; [its pitching workflow](https://knowledge.transferroom.com/how-to-pitch-your-verified-player) connects a chosen player to a requirement. [Footprint](https://www.footprintscout.com/product) describes brief, candidate and transaction feasibility together. [EnskAI](https://ensk.ai/) and the [ScoutDecision developer listing](https://play.google.com/store/apps/details?hl=en-US&id=com.scoutdecision.app) describe connected agency/scouting records. These are public product descriptions, not acceptance evidence for ReDream.

[Attio related records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records), [Linear drafts/properties](https://linear.app/docs/creating-issues) and [Notion typed properties](https://www.notion.com/en-gb/help/database-properties?nxtPslug=database-properties) support minimal capture with retained structured context. Adobe React Aria's Apache-2.0 primitives were considered; the current native controls already serve this slice, so no library is installed or proprietary implementation copied.

Actual deployed `djm_os.refresh_need_matches(uuid)` body MD5 `5717ce0f9e0cbf44db1475f275a1f7c9`: salary compatibility currently distinguishes missing versus nonempty free-text expectations, assigning constants 55/68, rather than comparing numeric affordability. It is **unchanged here**. Numeric player expectations, hard constraints/unknown compatibility and grounded evidence need their own reviewed migration and UI acceptance. Do not interpret recorded candidates or their old numeric scores as validated affordability.

Remaining gates include richer football requirements; source club/contact selection, received/deadline/priority/ownership/files; salary ranges, fees/bonuses/benefits/commissions; justified financial matching; external candidates without signing them; connected checks/shortlist/presentation/submission/replies/deals/outcomes. The programme retains these as child gates of REL-01/REL-02 and preserves all original 63 parent acceptance rows. Real time-to-capture, shortlist preparation, corrections and failed-operation baselines remain unmeasured; fixture timings are not user productivity outcomes.
