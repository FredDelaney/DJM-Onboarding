# Verified player to club links | 3 November 2026

## Problem and approach
Eight of ten active DJM players have a current-club name not exactly matching an agency club record. Club names are not reliable identity references. Do not merge similar names or backfill automatically.

## Implemented
- Tenant-scoped player_club_links table with composite foreign keys, RLS, server-only access and no automatic backfill.
- Admin-only roster search and manual club confirmation, preserving original text and audit record; edits to current club automatically invalidate a stale link.
- Verified links take precedence; exact-name fallbacks remain explicitly unverified.
- Club profile enables search, review and confirmation on mobile/desktop, then refreshes player associations.
- Club page replaces the directory within the workspace rather than stacking a page below mobile navigation.

## Staging evidence
Migration applied to staging Supabase; zero links automatically written; foreign keys and restricted grants verified. Staging agency-os version 71 deployed with JWT required. Five PGlite database tests and three interface tests passed. Browser flow across 390 and 1440 widths passed. All local tests, TypeScript, Next build and bundle budget passed. Production database and Edge function remain unchanged.

## Deployment sequence
1. Full GitHub CI green; rebase after frontend PR #293 merges to resolve shared club page changes.
2. Production schema preflight; apply only reviewed migration; check zero backfill, security and tenant constraints.
3. Deploy production agency-os action additions using the deployed original function and keep verify_jwt true.
4. Merge the frontend PR, then backend PR after compatibility; verify both production Vercel deployments point at merge SHA.
5. Signed-in DJM owner and limited staff acceptance before claiming total production verification. Do not invent live data.

## Future Athlivo parity
True transfer windows, budget ranges, multiple deal types, shortlist/matching, external pitch response and full history need separate scoped changes and acceptance.
