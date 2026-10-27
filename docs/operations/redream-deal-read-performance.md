# Live-deal loading: repeated war-room evaluation

Scope: OPS-03 / UX-05 / UX-07 / UI-06, stacked on draft PR 267 at `37ae4443cbddec56bf2168ab3d6479ac36c24b78`. Preserve all 46 programme rows and 17 UI surfaces. Production remains untouched.

## Evidence and repair

The cold staged Live deals page shows SQLSTATE 57014 and recovers via its existing Try again. The exact Postgres trace attributes the timeout to `redream_autopilot_deals` -> commercial risk -> legacy deal portfolio -> war room -> club/network/introduction expansion. A scoped authenticated-owner full-reader read takes 6,848.843ms on 26 October. The earlier trace, screenshot and 6,300.662ms EXPLAIN are retained in the opportunity-follow-through manifest.

Both existing portfolio functions project several fields from a stable per-deal war-room CTE. PostgreSQL inlines it and evaluates the expensive result repeatedly. Materializing that CTE evaluates each active tenant deal once before the existing ranking, field projection and visible limit. A real read-only staging candidate preserves the two-deal v2 projection/count. Local tests using the actual repository definitions (matching both installed source hashes) reproduce eight calls for two deals and reduce that to two, with identical full output excluding generated time.

No ranking, fact, probability, financial value, count, field, limit, tenant/status predicate, caller, ACL or approval changes. The existing server-only helpers remain server-only. The raw database error language is a separate retained UX-05 gap, not masked by a success claim.

## Exact staging manifest

- Staging project only: `ltvmopvarlnidiozvpow`.
- One forward migration: `supabase/migrations/20261026053423_materialize_deal_portfolio_context.sql`.
- File SHA256: `c3dbb4c8ab5cd6ee96bcdfdd3ece5994b63c0a1bfaca35ab8dec396d2c45f8ad`.
- `public.platform_server_deal_portfolio(uuid,integer)`: installed source MD5 `24e171425b815cb1501abe4ff5e4ea52` -> `d46835dd0718dea240176d53b6d37153`, OID 24093.
- `public.platform_server_deal_portfolio_v2(uuid,integer)`: installed source MD5 `45882fa929626bc52e043777b9044a22` -> `dae54c4b4b11608ae5d845da24b284a1`, OID 24222.
- Preserve owner, ACL `{postgres=X/postgres,service_role=X/postgres}`, empty search path, stable/security-definer mode and function signatures. The migration refuses unknown or missing bodies atomically and supports safe replay.
- No frontend or Edge deployment, business-row change, provider, schedule, secret or persistent configuration change is required. Never execute the excluded relationship migration or replay database history.

Keep exact before definitions/metadata privately. If recovery is required, review only restoration of these two known before definitions with unchanged grants/metadata; never drop/recreate helpers or broaden access. The currently accepted staging frontend remains `37ae4443cbddec56bf2168ab3d6479ac36c24b78` at immutable deployment `redream-systems-staging-a97c0vkk8-jesseedge10-8415s-projects.vercel.app`; no source rollout is needed for this SQL-only repair. The deployment ID remains in the private evidence; its opaque bytes collide with the repository's product-language guard, so committed manifests identify it by its equivalent immutable hostname.

## Validation and remaining acceptance

Five focused existing-SQL PGlite checks pass: repeated-call reproduction/one evaluation, exact DTO/rank/limits/defaults/empty/tenant/status parity (67 active records), unchanged service-only permissions/catalog/comments and replay, unknown-source atomic rollback and missing-reader refusal. `npm run check` passes 2,135 tests, every TypeScript project, production build and unchanged 144,794 / 150,000 gzip bytes.

Pending: commit/push/draft, exact installed ledger/source/catalog, full-reader result-summary/ID/role-denial/timing checks, cold/warm UI and error recovery, all original hashes/advisor sets and exact-head CI. No persistent hosted fixture is required. Do not compare the 1,026ms isolated projection experiment to the 6,849ms complete reader as a before/after speed claim. Record complete-reader measurements only after the exact repair is installed. Wider volume/staff/provider/physical-device/independent-agency and connected profile/follow-up acceptance remain open.

## Installed staging checkpoint

Draft [PR 268](https://github.com/FredDelaney/DJM-Onboarding/pull/268), product `64bfe4ae72afa53984f81f217ec4edd89a9f532c`, is pushed. The reviewed file is applied once on staging. The MCP assigns actual ledger version **20261026053920**, with name `20261026053423_materialize_deal_portfolio_context`. The stored statement equals the reviewed file byte for byte (MD5 `a89bb6e432b049bdd5bc08d8252f091a`, SHA256 above). Preserve this explicit file-to-ledger mapping; do not rewrite/backdate history or replay it to align filenames.

Both installed after-source hashes match the manifest. OID, owner, ACL, empty search path, signatures, stable/security-definer mode are unchanged. Actual authenticated-owner complete-reader measurements use the same workspace/request/100 limit and a transaction-local diagnostic deadline: 6,848.843ms before, 1,827.782ms and 2,126.512ms after. Root keys, ordered deal IDs, portfolio summary and commercial-risk summary match. These are a small two-record sample of database reader time, not a page-load percentile or representative-volume acceptance.

A read-only actual-role canary rejects a nonmember and a forged workspace identity with the canonical access-denied error. The final cold 390px browser list shows both original deals without the database error; screenshot 10 is saved and inspected. One browser-tool observation timed out, after which reattaching the same tab showed the completed load; it is not recorded as an application failure or a browser-speed measurement. Earlier actual Retry recovery remains evidenced; a repaired reader does not establish all error/volume/device states.

All nine full-row hashes and four original profile/career-entry/club/deal hashes match. Security and performance finding sets are identical after omitting only per-run observation timestamps (32 unindexed foreign keys, 18 auth init plans, 154 unused-index findings). No persistent fixture is created, no AI usage or commercial/task/player row changes, and no cleanup remains. Private `opportunity-follow-through-pass/portfolio-release-final.json` retains before/after catalog, exact ledger, measurements and data/advisor evidence.

CI product run `40275363247` passes the database checks but verify flags the opaque frontend deployment identifier in the new release notes. The notes now use its equivalent immutable hostname, preserving the language guard. All seven focused database/language checks pass after that documentation correction. Final documentation-head CI remains required; source/browser jobs are not treated as green while running. Parent PR 267 verify is green on `40274708079`, full browser remains live. No merge or production action has occurred.

Continue with clear raw-timeout recovery language and the existing opportunity -> approved profile -> accountable follow-up workflow. OPS-03 stays active for the earlier unattributed network timeout and broader load/recovery acceptance; UX-05/UX-07, all 46 programme items and 17 UI surfaces retain their unresolved scope.
