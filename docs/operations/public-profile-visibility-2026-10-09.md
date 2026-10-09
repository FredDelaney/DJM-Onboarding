# Public profile visibility rollout, 9 October 2026

## Status: implemented and reviewed, NOT deployed

Source branch: `fix/public-profile-visibility-boundary`.
Implementation commits: `f66ef151670c69aa19301665d9b18a48791bbd95` and `90cf0f21c8d8307f824a705d85e38a82a2538b55`.
Review range: `1225ab06e46dd7d81049849ab76f85baf42a5868..90cf0f21c8d8307f824a705d85e38a82a2538b55`.

Two staging apply_migration attempts returned `McpServerError: Invalid or expired requestState`.
Read-only checks after both attempts confirmed the new SQL helper is absent and the original raw SELECT grants/policy are unchanged in staging and production.
No Edge Function deployment, production migration, customer-token open, live view tracking, customer content rewrite or Vercel build was performed.
Do not describe this fix as live or the platform as privacy-ready until all remaining gates pass.

## Change

Raw player_public_profiles snapshots become readable only by their player and existing authorised staff. Existing tenant-admin INSERT/UPDATE/DELETE policies are unchanged.
Public responses use an explicit 28-field allowlist, with hidden content removed at SQL and final HTTP boundaries after automatic-stat assembly.
Summary and career are separate controls. Stats removes key_stats and stats_meta. Videos removes primary and selected videos. Market value requires boolean false hide_market_value.
Malformed flags fail closed; unknown new snapshot columns are not automatically published. Source snapshots are not mutated.

## Verification completed

- Fresh baseline: 1,608 tests passed.
- Current-boundary regression: 8/9 role assertions failed for the expected disclosure; unchanged admin-edit assertion passed.
- First fixed role run: 9/9 passed. Migration applied twice in isolated PGlite tests.
- Public-response regression: hidden sections, automatic statistics, malformed flags and internal/unknown fields failed against original code.
- Full fixed suite: 1,633 passed, 0 failed.
- npm run check: tests, TypeScript and production build passed, exit 0.
- Independent reviewer: no Critical/Important issues; independently passed 25 focused tests and 75 hand-derived SQL/TypeScript cases, including all 64 section combinations.
- Historical get_club_share equivalence confirmed apart from the profile projection wrapper. Token, expiry, verification, tenant, document and tracking predicates preserved.
- Public rendering and PDF paths consume the projected DTO without another raw snapshot fetch.
- Staging security-advisor baseline: 3 notices, none referencing changed objects. Existing deny-by-default/no-policy, executable security-definer and leaked-password-protection notices remain separate backlog.

## Prepared staging verification

`tests/fixtures/public-profile-staging-verification.sql` uses synthetic auth users, tenants, players and share/document records inside BEGIN/ROLLBACK. It has NOT been executed.
Custom triggers and reachable scoring/projection functions were inspected before preparing these fixtures. No outbound/dynamic-call candidates found in the traversed SQL call graph. Enrichment queue entries remain uncommitted and are rolled back before workers can observe them.
Run only in staging. Verify fixture absence after rollback.
The positive RPC calls run as session owner, so verify service_role/anon/authenticated execute grants separately.
Existing career-timeline triggers rebuild an empty timeline in this fixture; nonempty hidden-career sentinel proof comes from the isolated SQL/HTTP suite.
Positive HTTP checks use the actual handler modules and real Supabase client with synthetic transport. They are not a claim of positive-token hosted-runtime verification.

## Remaining rollout gates

1. Obtain a fresh working Supabase write approval/session. Re-check catalogue drift before retry.
2. Apply the exact reviewed migration in staging. Deploy both public functions and every relative dependency, keeping existing verify_jwt=false.
3. Execute staging rollback-only role/RPC fixture and verify service-only grants, RLS, eligible/ineligible links and documents.
4. Fetch deployed source and exercise it with synthetic HTTP fixtures. Run live CORS, method and fake-token canaries without customer tracking.
5. Compare new advisor notices with baseline and investigate changed objects.
6. Only after staging acceptance, apply/deploy the exact files in production.
7. Verify production catalogue, fake-token data:null, CORS/methods and unavailable-link browser state. Never open a real customer token for this check.
8. Record actual migration versions, Edge Function versions and production outcomes, then merge source through the repository workflow. No manual Vercel deployment is required.

## Exact SHA-256 source hashes

- Migration: c6b1c4beb5570a8f684b53e64c1f59136aed4c631b88583b818bd183cf8a0ae4
- club-share-public/index.ts: 14e983a65f88f0575d313f3741d54a7a8ad6c79fe4a4563998fcedc0377355ec
- player-profile-public/index.ts: 83a5c2209c44da3967d7ac7ecdeb9540187967e3b03e7a4b104c040051f706f3
- _shared/public-profile-visibility.ts: d1632dd437388620c9d06c754e24f0836a336020048c7c396169a1aeea4afde4
- _shared/football-data/player-data-workflow.ts: effdaef4851b4b67f03eeaabdfb7a9dc4f3402240d472078672023bfc3625bce

## Review rulings and deferred debt

Preserve approved nested DTO shapes. Unknown string hide-list entries are forward-compatible, not structurally malformed. Stats and career remain independent. Local fixture omissions require staging, not unsupported hosted-runtime claims. Historical unrelated advisors remain outside this bounded change.
Minor M1: both endpoints have a pre-existing declared-content-length-only 4KB check. Actual-byte bounded reads require a separate hardening pass. The reviewer did not consider it a privacy regression or rollout blocker.

## Recovery

Do not roll back by restoring broad anonymous/authenticated raw snapshot reads.
If deployment fails after the secure policy is applied, preserve that boundary and roll forward the public endpoint, or temporarily disable it while repairing.
The Supabase migration filename was generated locally with pinned CLI 2.120.0. Historical migrations remain untouched.
