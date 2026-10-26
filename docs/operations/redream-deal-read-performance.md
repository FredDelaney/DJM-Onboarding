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

Keep exact before definitions/metadata privately. If recovery is required, review only restoration of these two known before definitions with unchanged grants/metadata; never drop/recreate helpers or broaden access. The currently accepted staging frontend remains `37ae4443cbddec56bf2168ab3d6479ac36c24b78` / `dpl_C8z57wtd5QGpLHjLBKdbCrmV43Lj`; no source rollout is needed for this SQL-only repair.

## Validation and remaining acceptance

Five focused existing-SQL PGlite checks pass: repeated-call reproduction/one evaluation, exact DTO/rank/limits/defaults/empty/tenant/status parity (67 active records), unchanged service-only permissions/catalog/comments and replay, unknown-source atomic rollback and missing-reader refusal. `npm run check` passes 2,135 tests, every TypeScript project, production build and unchanged 144,794 / 150,000 gzip bytes.

Pending: commit/push/draft, exact installed ledger/source/catalog, full-reader result-summary/ID/role-denial/timing checks, cold/warm UI and error recovery, all original hashes/advisor sets and exact-head CI. No persistent hosted fixture is required. Do not compare the 1,026ms isolated projection experiment to the 6,849ms complete reader as a before/after speed claim. Record complete-reader measurements only after the exact repair is installed. Wider volume/staff/provider/physical-device/independent-agency and connected profile/follow-up acceptance remain open.
