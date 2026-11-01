# ReDream Clubs reference experience

## What is delivered

The Clubs navigation shows a clean directory modelled on the supplied design reference, but styled using the tenant's ReDream colour. Search, columns, country filters, sort and pagination are interactive. Clubs are read from the actual agency database; the list is not seeded with fabricated or borrowed Athlivo records.

Add Club offers two paths:

- Search Club queries the server-side public-domain OpenFootball catalogue. Selecting one runs an authenticated, tenant-scoped, idempotent import and opens the real club profile on success.
- Manual Entry uses ReDream's existing club creation flow.

The club profile includes Overview (assigned roster players and permitted contacts), Requests (existing recorded club needs) and Deals (existing recorded deal rooms). Contact creation supports name, club, role, email, phone and notes using the existing operator-level access control.

## Data source and limits

The checked-in `data/openfootball-clubs.json` catalogue is generated from [OpenFootball/clubs](https://github.com/openfootball/clubs), licensed CC0 1.0. The file records the upstream Git commit SHA, source URL, and licence; it includes 3,549 entries across 101 countries and territories at the time of generation. Names and aliases are useful for discovery, not live verified registrations.

OpenFootball does **not** guarantee current leagues, official badges, player-club affiliations or complete global coverage. We intentionally show original initial-based shield placeholders instead of reusing club crests without permission. League information is shown only when explicitly saved/verified. To add official-looking badges and live league metadata, integrate a properly licensed commercial football API, preserving its attribution, provider terms and caching limits.

The local directory is agency-scoped, not a public database of every football team. Importing a club does not automatically establish a player, contract, deal or contact relationship. Player counts reflect exact current-club name matches, not verified registration, and are available only to tenant administrators.

## Permissions and integrity

- `platform_server_clubs_directory`: tenant membership validation, true paginated reads, restricted commercial counts, only admins see roster counts.
- `platform_server_agency_import_club`: operator role required, tenant-scoped create-or-reuse helper, immutable source ID link and audit on newly created club.
- `platform_server_club_reference_people`: admin-only contact disclosure; staff see only roster players assigned to them.
- `platform_server_agency_create_contact_with_methods`: operator access, validated optional email and phone, existing contact creation pathway, contact methods saved transactionally.
- Do not show the screenshot's Admin Only / Everyone / Specific People selector until per-contact disclosure controls are enforced throughout every contact read/export/search path. A decorative control would create false expectations and expose private agency relationships.

All public SQL wrappers revoke execution from anonymous and ordinary authenticated database roles; the existing authenticated agency Edge Function is the only intended entry point. Tenant/role checks remain in SQL too.

## Rollout and verification

1. Apply the migrations in `supabase/migrations/` in filename order. The migrations with `20261101162000` and `20261101162500` are safe follow-up corrections for databases that previously applied the initial staged versions.
2. Deploy `agency-os` with all its relative `_shared/` dependencies and `verify_jwt=true`. Preserve the corrected `agency-dashboard-snapshot.ts`.
3. Run unit tests, TypeScript, Next build and logged-in browser journeys. Confirm existing-club deduplication, tenant isolation, restricted staff views and contact persistence. Never test create actions by making untracked production records.
4. Rollout staging before production. Confirm the Vercel preview environment uses staging Supabase; production must keep production Supabase.
5. For advanced club logos, leagues and verified identities, assess API-Football or another contractual football data provider. Do not scrape Athlivo, infer its database or borrow its private branding/assets.

Staging deployment from this feature branch: `agency-os` version 70. Production remains untouched by this Clubs feature until the PR is reviewed and the backend release is approved.
