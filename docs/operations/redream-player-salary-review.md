# Player salary terms and request comparison

Programme: REL-02-A / REL-01-C / UI-05 / UI-06. This is a sourced salary-review increment, not acceptance of the complete matching or request-to-outcome workflow. New frontend hosted acceptance and exact-head CI remain open.

## Problem and implementation

The installed `refresh_need_matches` routine assigns commercial scores of 55/68/72 based on the presence of a free-text salary note. It does not compare numeric player expectations with the club budget. Deal-negotiation guardrails already exist, but they are specific to a deal and cannot truthfully become a player's general salary requirements.

The existing private `djm_os.player_market_facts` now holds optional minimum/target base salary, currency, weekly/monthly/annual period, gross/net basis, source status/context, checked date and independent revision/actor metadata. No legacy note is parsed or overwritten, no deal guardrail becomes a fallback, and no signed-player/prospect distinction changes. Existing synchronisation columns and writers remain. Amounts use exact unconstrained numeric values with strict input/range/currency precision checks and decimal-string DTOs, rather than floating-point round trips or silent rounding. Unknown stays null; a recorded zero stays zero. Confirmed terms require a source and a non-future checked date.

The existing admin player work view has one collapsed Salary expectations section. It loads only on opening, shows the legacy note separately and reuses the existing management editor, overlay, dirty-draft/discard, mutation deadlines and uncertain-outcome recovery. An edit-only entrypoint cannot archive/delete the underlying player. Saves use the expected salary revision, exact player/version acknowledgement and private audit attribution. Known stale edits preserve the draft and explain how to cancel/reload. Unknown outcomes offer read recovery without replay. Reads have a 12-second deadline, cleanup and scope/lifetime protection. Existing exact commercial formatting preserves all supported decimal precision.

The existing exact-need reader and an explicit administrator overload of fast demand control return a current salary comparison. The old two-argument fast reader is byte-identical and gains no private financial fields. The Edge handler supplies the verified actor only for the admin path; request-body user/role claims cannot select it. The existing generic handler permission rules remain. The request candidate shows amounts, units, source uncertainty, checked date and the concrete gap before its separate career assessment.

Only equal currency, period and gross/net basis are compared. Different currency/tax/period, missing structured values and malformed legacy club budgets remain explicit unresolved states. Minimum-over-budget and target-over-budget are distinct. Both sources must be confirmed before a recorded minimum gap is classified as a confirmed hard conflict. Fitting a recorded base salary is not agreement, player earnings, guaranteed contract value or agency revenue. No exchange rate, tax conversion, paid-month count, fee, bonus, benefit or contractual guarantee is inferred.

The PostgreSQL [numeric documentation](https://www.postgresql.org/docs/17/datatype-numeric.html) supports the exact storage choice. Current Supabase changelog/function/RLS guidance and the existing project visibility contract were checked; no framework, dependency or parallel operating model was introduced.

## Staging manifest

Only project `ltvmopvarlnidiozvpow` is changed. Production `xogoigaaskmuspiehkba` is untouched.

1. Applied ledger version **20261028224735**, name `player_salary_terms_and_comparison`, file `supabase/migrations/20261028224735_player_salary_terms_and_comparison.sql`. The CLI-created filename was aligned to the returned ledger version with identical SQL bytes. Do not replay or edit it.
2. `agency-os` **65 ACTIVE**, id `4d095c51-3f65-4f3f-9ab3-18f8f4f50c65`, JWT true, no import map, bundle SHA-256 **015aaf1f2d57baa470dd6f0fb240d377d0d71516bf184ab19f8dce66b2f6201f**. All eight downloaded source files match the local closure. Only the demand-control argument selection differs from version 64. Unauthenticated access returns 401.
3. New frontend needs the migration and worker above. Install only an exact validated source after CI and the existing deployment quota permit. The existing hosted frontend remains the prior accepted artifact; no new frontend deployment is claimed here.

Never execute `20260930142119_restore_redream_relationship_person_entrypoint.sql`.

New function body MD5s:

| Function | Body MD5 | Access |
| --- | --- | --- |
| `private.player_salary_terms_json(uuid)` | `370637b477ec567995fddd39faf71530` | Owner only, invoker |
| `redream_player_salary_terms(uuid)` | `e5b1ec8f92c01bbbe5f8d699cc71ba63` | Active selected-workspace owner/admin, explicit DTO |
| `redream_player_salary_terms_patch(uuid,timestamptz,jsonb)` | `bf14a331ebabe8b254b17eddf17a4b2c` | Same authority, row locks, expected revision, audit |
| `private.player_need_salary_check(uuid,uuid,uuid)` | `a3a298d8f86b038c7c31c359797bdc9e` | Owner only, invoker |
| `platform_server_demand_control_fast(uuid,integer,uuid)` | `6003e30014faa9d6ae12916a64a1dace` | Service only plus active admin actor check |
| Existing `platform_server_workspace_need_record(uuid,uuid,uuid)` | `7b7a00feb1a0365dd090b9fe87f01a10` | Existing service/admin contract preserved |

All fixed empty search paths are explicit. Existing function OIDs, owners, ACLs, modes, paths and volatility are preserved. Matching, original two-argument fast reader, admin authority helper and legacy sync body hashes are unchanged. Table grants, policies and RLS are identical. No new authenticated table-write policy exists. The actor FK is indexed. Private terms do not enter player/public/share/PDF DTOs, AI or notifications.

## Evidence

- Full local milestone `npm run check` passes **2,238 tests**, every TypeScript project, production build and initial workspace gzip **146,239 / 150,000 bytes**. Final permission/fixture/date refinements pass **30** affected database/Edge tests and all-project typecheck; earlier 40 focused contracts also passed. The subsequent Edge regression is additional to that full-suite count.
- Existing browser infrastructure covers lazy reads, read failure/timeout/late reply, exact save, definitive denial/draft retention, stale colleague version, uncertain acknowledgement/read-only recovery and player switching. Editor and saved state fit 320/390/768/1440. Existing shared usability and four-width request review/edit/recovery pass, including the visible numeric conflict, explicit missing comparison and refreshed club budget. Mobile/desktop output is inspected; no new browser framework or dependency.
- Actual hosted authenticated/service canary `docs/operations/sql/redream-player-salary-canary.sql` passes fresh invited agency identity, exact save/read, no-op revision, stale/invalid denial, own/foreign and dual-admin selected-workspace isolation, staff/ended-member/anonymous denial, direct-write protection, private service overload, fresh numeric comparison, current audit actor, legacy note/sync preservation and unchanged manual match/reasoning. It rolls back all synthetic changes. The first run failed on a fixture-only unsupported `revoked` status; the test now uses actual `ended` and models actual role/status checks. No product trigger or membership constraint was weakened.
- Original projections match before/after: **1** legacy market-facts row excluding only the ten new nullable columns, **7** players, **4** matches, **151** audits and **48** AI usage events. There are zero synthetic salary tenants/users and zero persisted structured-salary rows. This is scoped evidence, not a whole-database zero-change claim.
- Security advisors **183 -> 185**: exactly two deliberate scoped authenticated-definer notices for the read/write bridge, no other added finding. Performance **203 -> 204**: one expected unused-index INFO for the actor FK index, no added unindexed-FK warning.
- Signed-in existing staging owner Opportunities and Calendar still load after worker 65 without writes. The Calendar task editor opens, displays its current record and Close returns focus to its Update opener. This verifies the existing hosted frontend, not the new salary UI or a physical device.

Evidence files: `/tmp/redream-platform-programme/salary-*.log`, `salary-backend-before.json`, `salary-backend-after.json`, `salary-edge-before.json`, and `player-salary/` / `club-need-review/` images.

## Remaining acceptance and rollback

`refresh_need_matches` and its old aggregate/commercial scores are deliberately **not yet replaced**. This increment does not label them financially accurate or complete REL-02-A/B. Next matching work must use current numeric constraints in the canonical matching/pursuit decisions, retire unsupported score contributions, define justified time/version-bound financial overrides without bypassing career approval, and handle explicit cross-period payment assumptions, freshness, registration, availability and football evidence. Manual selections/evidence must survive. External candidates and broader collaboration/outcome gates remain open.

Current-source browser CI, the actual new hosted player -> request salary journey, ordinary staff, physical iPhone/Safari, independent agency and production acceptance remain open. Formal programme acceptance stays **2/63 (3%)**, retaining all 46 programme and 17 UI parent rows.

Rollback the frontend to the prior accepted artifact and, if needed, deploy preserved worker 64 source with its original JWT/import settings. Leave the additive database migration installed; do not drop financial facts or replay historical migrations. Old worker/read signatures remain compatible, and private terms stay absent from their DTOs. No production rollout, merge, external share/send, contract acceptance or customer-term mutation is included.
