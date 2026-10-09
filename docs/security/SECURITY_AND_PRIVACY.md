# Security and privacy

Supabase Auth, RLS, explicit grants, scoped RPCs and protected Storage are the security boundary. Service-role keys stay server-side. Privileged functions validate the authenticated user and restrict execute grants.

## Current verified backlog

The August 27, 2026 live audit reported 90 security notices: 75 authenticated GraphQL exposures in `djm_os`, 2 intentional/review-needed anonymous GraphQL exposures, 10 executable security-definer notices, `pg_net` in `public`, one deny-by-default table without policies and leaked-password protection disabled. These require a dedicated reviewed migration and regression pass; they must not be patched blindly in production.

Sensitive data is minimised, purpose-bound, exportable/deletable where required and withheld from models unless necessary for an authorised task. Audit logs must avoid secrets and unnecessary private content.

## Staff access alignment

The August 27 audit found two profiles carrying an `admin`/`scout` role but only one active `djm_os.team_members` record. That split authorisation boundary can admit a user to Players while rejecting Command, Market, Deals and Brain. Migration `20260827130000_djm_intelligence_foundation.sql` adds a fixed-search-path profile trigger and one-time backfill so role grant/revocation and operational membership change in the same transaction. The trigger preserves inactive membership history rather than deleting it.

## Public-profile boundary, 9 October 2026

The reviewed fix in branch `fix/public-profile-visibility-boundary` restricts raw snapshot SELECT to private.can_view_player and projects only visibility-approved fields through public SQL/HTTP responses. Authorised player/staff snapshots and admin writes stay intact.
**Not deployed yet:** two staging migration requests expired in the connector before application. Read-only staging and production checks confirm the existing broad read boundary remains. This is an outstanding privacy release blocker, not a completed production fix.
See `docs/operations/public-profile-visibility-2026-10-09.md` for test/review evidence, exact hashes, remaining staging/production gates and secure roll-forward guidance.
