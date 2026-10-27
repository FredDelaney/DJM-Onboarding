# Agency work brief

## Behaviour

The existing Ask ReDream surface recognises factual work/context questions such as “What do I still need to do for Dylan?” and “What did we agree with James?”. These use one bounded, read-only database request, without a model call. General research and drafting continue through the existing agent.

An explicit name overrides page context. Matching records are independently re-authorised; ambiguous or truncated matches require selection. Missing names ask for a record, and inaccessible records fail closed. A failed read never claims that no work exists. Reads have a 12-second deadline, Retry, duplicate-request and stale-user/workspace protection.

The brief lists the caller’s owned tasks and explicitly assigned/shared work, dates, overdue status and responsible colleagues. Record views include structurally linked work; standalone Calendar reminders appear in My priorities. Results are limited to 40 items and disclose truncation. Existing administrator-only notes, recruitment notes and deal blockers retain their permission boundary. Recorded notes keep provenance and are not presented as proof of a completed agreement.

Links open the existing scoped records or Calendar task drawer. Preparing a follow-up or updating an owned task only fills Tell ReDream’s editable text. The user supplies the next action/date and submits through existing review, matching and mutation safeguards. No message is sent or task changed by a work query or handoff.

## Deployment manifest

1. Apply only `supabase/migrations/20261021045858_agency_work_brief.sql`, staging first. This adds `public.redream_agency_work_brief_v1(text,uuid,text)`; authenticated users can execute it, anonymous users cannot. Actor and tenant resolve through existing server guards, not caller arguments. It reads existing stores and changes no customer rows or table permissions.
2. Deploy the frontend from the validated commit after the migration.
3. No Edge Function, secret, environment variable or Supabase configuration change is required. In particular, preserve staging’s existing `redream-agent` source; its unrelated decision workflow differs from main.

Existing context, workspace search, responsibility and Calendar helpers are prerequisites already present in both environments. Do not replay historic migrations. The excluded relationship-entrypoint migration is unrelated and must not be applied.

Rollback: restore the previous frontend. The additive read-only RPC is compatible with older clients and can remain in place. Production acceptance uses read-only requests; automated writes run only in isolated fixtures.

## Validation

Focused PostgreSQL/PGlite tests execute the actual context reader and shared-responsibility implementations with controlled search/auth fixtures. They cover tenant/role/lifecycle restrictions, inaccessible records, ambiguity, shared ownership/deduplication, date-only overdue handling, missing dependencies, bounded results, provenance and restricted grants. Pure tests cover question routing, page versus explicit-name scope, existing deep links and editable follow-up wording.

Browser fixtures exercise the existing Ask/Tell components: explicit record selection, work/source links, shared people, recorded notes, reviewed handoff, zero model/mutation calls, failed reads, retry of the selected record, deadline expiry and a late response after workspace switching. Layouts are checked at 320, 390, 768 and 1440 pixels. These are simulated Chromium checks, not physical iPhone/Safari verification. Required repository checks and both GitHub CI jobs must pass before merge.

## Hosted staging database acceptance

The new RPC resolved Northstar through the real authenticated workspace guard, returned the current caller’s work and correctly read the selected synthetic player. Anonymous execution is revoked. Actual database assertions also confirmed foreign-tenant record denial, unavailable-workspace denial, unauthenticated denial and missing-name clarification. These requests used a rolled-back transaction and made no customer-data changes.
