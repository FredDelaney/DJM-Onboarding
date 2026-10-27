# Public Player Profile Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Restore club links with a real server-side visibility boundary, preserving authorised player and staff workflows.
**Architecture:** Restrict raw-table reads to existing actor authorisation. Use allowlisted visibility projections in the club SQL RPC and the final public HTTP responses, after any automatic statistics have been assembled. Keep the existing published snapshot for authorised editing.
**Tech Stack:** Next.js 16 / React 19 (unchanged), TypeScript, Supabase Postgres 17 and Deno Edge Functions, Node 24, PGlite and Playwright.
**Spec:** docs/superpowers/specs/2026-10-09-public-profile-visibility-boundary.md

## Global Constraints

- Do not delete or rewrite customer profile content, rotate credentials, widen permissions, change other tables, or disable GraphQL globally.
- No new application dependencies or Vercel deployment is required for this backend change.
- Use an additive, CLI-generated migration; keep historical migrations intact.
- Use synthetic fixtures for positive tests. Production verification must not open real customer share tokens or create tracking events.
- Roll out only after failing regression tests, passing full local checks, independent review and staging verification.

## Review Focus

- Published raw rows must remain inaccessible to anonymous and unrelated authenticated callers.
- Own-player, assigned-scout and tenant-admin reads/edits must survive policy changes; revoked assignments and other tenants must be denied.
- Automatic statistics or PDF generation must not restore hidden sections after response projection.
- Invalid visibility flags and unknown future columns must fail closed without breaking approved identity data.
- Expiry, revocation, verification loss and sensitive-document denial must remain effective after the RPC change.

---

### Task 1: Lock down direct profile-table disclosure

**Files:** Create tests/public-profile-visibility-database.test.ts; create one migration via Supabase CLI with suffix public_profile_visibility_boundary.sql. Do not invent its timestamp.
**Interfaces:** Consume private.can_view_player(uuid). Preserve authenticated/service_role table grants and all existing write-policy predicates. Produce no anonymous table-read access and an authenticated SELECT policy using only private.can_view_player(player_id).

- [x] Write PGlite tests using current production policy predicates and actual ownership/staff helpers plus synthetic actor fixtures. Assert anonymous SELECT is denied, unrelated/cross-tenant/revoked-assignment authenticated reads return zero rows, own-player/assigned-scout/admin reads return the owned rows, and permitted admin UPDATE still works.
- [x] Run node --experimental-strip-types --test tests/public-profile-visibility-database.test.ts; first verify the anonymous and unrelated published-read assertions fail against the current boundary.
- [x] Discover an available pinned Supabase CLI and read migration new --help; create the migration with that command. Revoke table SELECT from PUBLIC/anon, remove the obsolete anonymous policy, and change the authenticated SELECT predicate to private.can_view_player(player_id). Keep RLS enabled and existing write predicates unchanged.
- [x] Apply the migration twice in isolated tests to prove idempotency; repeat all role tests.
- [x] Commit the tested migration and its behavioural tests without pushing a frontend deployment.

### Task 2: Redact public responses and the club RPC

**Files:** Create supabase/functions/_shared/public-profile-visibility.ts; modify supabase/functions/club-share-public/index.ts and supabase/functions/player-profile-public/index.ts; extend the Task 1 migration; create tests/public-profile-visibility-edge.test.ts.
**Interfaces:** Export visiblePublicPlayerProfile(value: unknown): Record<string, unknown> | null and publicProfileSectionHidden(value: unknown, section: string): boolean. SQL helper private.visible_public_player_profile(jsonb) returns jsonb, SECURITY INVOKER, immutable, fixed empty search_path, service-only execute. get_club_share(uuid) retains its signature, existing share/document/tenant conditions and service-only grants.

- [x] Write table-driven HTTP tests for each hidden section independently, with literal synthetic secret markers in only that section. Assert response text excludes each marker and still contains the approved display_name.
- [x] Include hidden automatic-statistics and stats_meta cases, separate summary versus career controls, malformed flags, unknown new columns, allowed video/research/contact fields, empty profiles, unavailable links and upstream failure.
- [x] Run the new tests against actual current handlers before adding helpers; prove hidden-section and unknown-field assertions fail for the intended reasons.
- [x] Implement an allowlist projection of the currently approved public profile fields. Clear hidden text/link fields to null and hidden array fields to []; expose market values only for boolean false. Malformed hidden_sections hides optional sections. Do not mutate the source snapshot.
- [x] Apply the TypeScript projection to both handlers immediately before their response. Remove stats_meta when stats are hidden. Do not add another database round trip.
- [x] Add equivalent private SQL projection and use it for the profile object in get_club_share. Preserve token, expiry, publication, verification, organisation-tenant and approved-document predicates exactly.
- [x] Exercise actual SQL and HTTP handlers with PGlite-backed Supabase transport. Assert identical hand-derived visibility expectations for SQL and TypeScript, browser-role RPC denial, no denied-request tracking, permitted-read tracking, and tracking-failure tolerance.
- [x] Run npm test and npm run check. Record the complete counts, failures and exit codes, not only the new tests.
- [x] Commit the passing backend code and tests without changing Next.js/UI files.

### Task 3: Independent review and controlled rollout

**Files:** Update docs/security/SECURITY_AND_PRIVACY.md and docs/operations/public-profile-visibility-2026-10-09.md with exact evidence.
**Interfaces:** Staging project ltvmopvarlnidiozvpow; production xogoigaaskmuspiehkba; functions player-profile-public and club-share-public. Preserve pre-existing verify_jwt=false/custom capability or published-profile access.

- [x] Read requesting-code-review, dispatch one read-only reviewer with exact SHAs/spec/tests, and resolve all Critical/Important findings before deployment.
- [x] Check staging/production catalogue parity immediately before migration; stop if the affected policies/functions changed unexpectedly.
- [x] Apply the tested migration in staging using apply_migration. Deploy both reviewed Edge functions with every relative dependency and runtime config included.
- [x] Use isolated, rollback-only staging fixtures to verify real Postgres actor policies and synthetic HTTP fixtures to verify visible/hidden content, eligibility and documents. Inspect fixture triggers first; do not create provider calls, real emails or customer views.
- [x] Run advisors and investigate new notices for the changed objects. Record unrelated pre-existing findings separately, without broad production patches.
- [x] Stage acceptance requires anonymous/unrelated denial, authorised actor reads/edits, hidden HTTP/SQL content absence, active-token success and all denied-token cases.
- [x] After staging passes, apply the exact migration and deploy the exact reviewed backend files to production. No extra Vercel build.
- [x] Verify production grants/policies/function definitions, fake-token POST data:null, CORS, unsupported methods, and unavailable-link browser state. Do not test with real customer tokens.
- [x] Record source hashes, migration/function versions, full local checks, staging proof and production limits. Rollback must not silently reopen raw public reads; preserve the secure boundary and roll forward or temporarily disable the affected public endpoint.
- [x] Commit the final verification record. If a repository push triggers preview builds, cancel duplicate previews and do not request a manual Vercel build.

## Self-review

Spec requirements map to the three tasks. Each review-focus case has an explicit behavioural test above. Public/private visibility mapping preserves the separate summary and career controls. No unrelated RLS or product redesign is included.

## Execution handoff

Recommended execution: native implementation by the main agent, followed by one independent read-only review. The SQL/HTTP permission changes are tightly coupled; splitting their implementation across agents would add coordination without improving the boundary.
