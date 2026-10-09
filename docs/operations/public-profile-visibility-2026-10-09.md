# Public profile visibility rollout, 9 October 2026

## Status: live in staging and production

Source branch: `fix/public-profile-visibility-boundary`.
Implementation commits: `f66ef151670c69aa19301665d9b18a48791bbd95` and `90cf0f21c8d8307f824a705d85e38a82a2538b55`.
Independent review range: `1225ab06e46dd7d81049849ab76f85baf42a5868..90cf0f21c8d8307f824a705d85e38a82a2538b55`.

Staging migration: `20261009083802_public_profile_visibility_boundary`.
Production migration: `20261009144031_public_profile_visibility_boundary`.
Staging functions: club-share-public v3, player-profile-public v4.
Production functions: club-share-public v1, player-profile-public v13.
All four functions are ACTIVE with verify_jwt=false, preserving published-profile access and custom UUID capability validation.
The club function was absent in production before this release.

No customer-token opens, customer tracking writes, customer content rewrites or Vercel frontend builds were used for this rollout.

## Change

Raw player_public_profiles snapshots are readable only by their player and existing authorised staff. Existing tenant-admin INSERT/UPDATE/DELETE policies are unchanged.
Public responses use an explicit 28-field allowlist, with hidden content removed at SQL and final HTTP boundaries after automatic-stat assembly.
Summary and career are separate controls. Stats removes key_stats and stats_meta. Videos removes primary and selected videos. Market value requires boolean false hide_market_value.
Malformed flags fail closed; unknown new snapshot columns are not automatically published. Source snapshots are not mutated.

## Verification

- Fresh baseline: 1,608 tests passed. Fixed full suite: 1,633 passed, 0 failed.
- npm run check passed tests, TypeScript and production build.
- Original role regression: 8/9 role assertions failed for the expected disclosure; unchanged admin-edit assertion passed.
- Fixed role suite: 9/9 passed. The migration was applied twice in isolated PGlite tests.
- Independent reviewer found no Critical/Important issues and passed 25 focused tests plus 75 hand-derived SQL/TypeScript cases, including all 64 section combinations.
- Historical get_club_share equivalence confirmed apart from the profile projection wrapper. Token, expiry, verification, tenant, document and tracking predicates preserved.
- Public rendering and PDF paths consume the projected DTO without another raw snapshot fetch.
- Hosted staging rollback fixture passed own-player, assigned-scout, tenant-admin and unrelated-user reads, immediate assignment revocation and membership suspension, admin writes, denied player/scout writes, draft access, eligibility and document restrictions.
- Post-rollback staging fixture tenant count: zero.
- Downloaded staging function source matched reviewed source, ignoring trailing EOF newlines; 25 tests against those downloaded handlers passed.
- Staging and production hosted canaries passed CORS, no-store, GET 405 and fake-token/slug POST data:null checks.
- Production raw anon SELECT is revoked. Authenticated SELECT uses private.can_view_player. Service-only RPC grants and existing write policies were verified separately.
- Production can_view_player definition is unchanged. Production get_club_share matches accepted staging SQL.
- Downloaded production entrypoints and dependencies match reviewed source. Both bundle hashes match staging.
- Live browser checks passed 15 marketing screen/viewport combinations at 320, 768 and 1440 pixels and both synthetic unavailable public-profile/share links.
- Staging advisor categories remain the same three baseline categories; no changed-object notice. Production advisor categories remain a separate historical backlog.

## Scope of staging proof

`tests/fixtures/public-profile-staging-verification.sql` creates synthetic auth IDs, tenants, players and share/document records inside BEGIN/ROLLBACK. It contains no credentials or real customer details.
The original larger connector request expired. A smaller scoped fixture passed through the same execute_sql tool; no permission-mode change or alternate execution bypass was used.
Custom triggers and reachable scoring/projection functions were inspected before fixture execution. No outbound/dynamic-call candidates were found in the traversed SQL call graph. Uncommitted enrichment-queue entries were rolled back before workers could observe them.
The positive RPC calls run as session owner, so service_role/anon/authenticated execute grants are verified separately.
Existing career-timeline triggers rebuild an empty timeline in this fixture; nonempty hidden-career sentinel proof comes from the isolated SQL/HTTP suite.
Positive HTTP checks use actual deployed handler source and the real Supabase client with synthetic transport. Positive-token hosted HTTP sessions were not exercised.

## Exact SHA-256 source hashes

- Migration: c6b1c4beb5570a8f684b53e64c1f59136aed4c631b88583b818bd183cf8a0ae4
- club-share-public/index.ts: 14e983a65f88f0575d313f3741d54a7a8ad6c79fe4a4563998fcedc0377355ec
- player-profile-public/index.ts: 83a5c2209c44da3967d7ac7ecdeb9540187967e3b03e7a4b104c040051f706f3
- _shared/public-profile-visibility.ts: d1632dd437388620c9d06c754e24f0836a336020048c7c396169a1aeea4afde4
- _shared/football-data/player-data-workflow.ts: effdaef4851b4b67f03eeaabdfb7a9dc4f3402240d472078672023bfc3625bce
- Club bundle: a2c4ffe7650cb472b8225cacd7e9e44841549e8637a872dea6a8f14025a8d727
- Player bundle: 0c6f411d216ada665cca22abfa8299f29a2d160799659f599b174e5661a25437

## Review rulings and deferred debt

Preserve approved nested DTO shapes. Unknown string hide-list entries are forward-compatible. Stats and career remain independent. Local fixture omissions require staging, not unsupported hosted-runtime claims. Historical unrelated advisors remain outside this bounded change.
Minor M1: both endpoints have a pre-existing declared-content-length-only 4KB check. Actual-byte bounded reads require a separate hardening pass. The reviewer did not consider it a privacy regression or rollout blocker.

## Recovery

Do not restore broad anonymous/authenticated raw snapshot reads.
If an endpoint fails, preserve the secure policy and roll forward the endpoint, or temporarily disable it while repairing.
The Supabase migration filename was generated locally with pinned CLI 2.120.0. Historical migrations remain untouched.
