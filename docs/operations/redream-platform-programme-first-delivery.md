# ReDream platform programme: first delivery manifest

Status: both migrations applied and canary-validated on staging; production unchanged. The full programme remains tracked in `docs/exec-plans/active/redream-platform-programme.md`.

## Frontend scope

- DAY-01: meaningful player work replaces repeated generic setup warnings; existing action/work-view routes remain.
- PLY-02: staff profile headline figures show their actual period/source/date, with intentional custom scope kept separate.
- DAY-02: authorised player-data reviews are grouped below the five business priorities; actual deadlines and undated tasks are labelled truthfully; failed assignment reads have Retry.
- Existing completion, Undo, shared responsibility, photo, verification, publication and tenant routes remain intact.

## Database manifest

Only these two new migrations belong to this increment:

1. `20261023142549_repair_change_review_tenant_context_v1.sql`
2. `20261023142943_scope_change_observations_to_canonical_tenants_v1.sql`

No Edge Function, secret, auth configuration or cron schedule change is required. No data backfill or broad migration replay is included. Never execute `20260930142119_restore_redream_relationship_person_entrypoint.sql` or `db push --include-all`.

The first migration replaces only the verified legacy `djm_os.queue_change_review_items()` body. The tenant comes from an existing person, organisation, player or prospect, with no signed-in/primary-agency fallback. A person review owner must have an active same-agency staff relationship. A transaction advisory lock plus same-tenant/open-observation deduplication serialises repeated cron/server calls. Missing, deleted or unsupported subjects remain pending and are counted as `skipped_unresolved`; their evidence is never silently accepted or removed.

The second migration replaces only the four verified global-team policies on `djm_os.change_observations`. Canonical-subject tenancy plus current staff membership governs reads, inserts, updates and deletes. Both the existing row and proposed row are checked on update. Independent-agency staff do not require global DJM membership. Unknown subjects are unavailable to browser callers and remain available to authorised server repair. Existing table grants, RLS enablement, records and tenant triggers remain.

## Preflight and release gates

- Required local/CI tests, typechecks, build, bundle limit and affected browser journeys must pass on the reviewed head.
- Both hosted environments were inspected read-only on 23 October 2026. Their cron body MD5 is `bca01cd5fed1c6854f2fe394f09111ab`; execute is restricted to the owner and `service_role`. Four `authenticated` observation policies use exactly `( SELECT djm_os.is_team_member() AS is_team_member)`. Each migration deliberately refuses unexpected drift.
- Production currently has one pending low-confidence prospect observation with a real canonical tenant; staging has none. Do not execute a production canary that creates or accepts customer work. Use isolated synthetic staging records for positive/negative and repeat-call acceptance.
- Apply the two reviewed files as a controlled staging-first release, preserving canonical migration ledger versions. Complete both changes before accepting the repaired job. Do not leave a partial release as accepted.
- Verify exact function/policy definitions, retained grants, actual cron result, tenant/role denials and advisor delta. Repeat-call acceptance must show no duplicate open review. Confirm source observations were not rewritten.
- Production application, frontend promotion and actual live acceptance remain a separate authorised release gate. Local PGlite/browser fixtures alone do not prove hosted acceptance or real cron concurrency.

## Rollback and retained limits

Capture the actual function definition, policy definitions, ACLs and current release deployment before rollout. Restore reviewed function/policy definitions if the release regresses; preserve every observation, queued review and migration history entry. Do not restore a broad browser policy as an automatic rollback: restoring the previous global-team policy reopens the reproduced source-data exposure and requires a deliberate security decision.

Nine focused PostgreSQL regressions cover the original failure and scoped repair. Their membership fixtures now enforce the canonical role/status checks and use suspended/ended memberships and actual player roles, rather than unsupported viewer/revoked literals. The remaining platform security findings, broader source ingestion contracts, physical-device testing and independent-agency acceptance remain in the master plan.

## Staging result, 23 October 2026

The two exact migration sources are installed with canonical versions `20261023142549` and `20261023142943`. MCP initially generates its own ledger timestamp; each row was normalized only after exact name, one-statement content hash and canonical-version absence checks. No historical entry was replayed or overwritten.

The real hosted canary in `sql/redream-programme-staging-acceptance.sql` passed correct two-agency person/prospect routing, repeat-call deduplication, unresolved-subject retention, unchanged source evidence, same-agency RLS CRUD, foreign insert/reassignment denial, independent staff without global team status, player/ended-membership denial and server-only execute. All test writes were rolled back. Before/after hashes of observations, reviews, branding, grants and cron jobs match, with zero synthetic tenants left. The new queue body MD5 is `e1116b5f9c28b0066bcbe58f29cc8bf6`; execute remains owner/service-role only.

Staging has no change-review cron schedule. No schedule was added: this validates direct execution of the actual repaired function, not a scheduled staging run. Production cron execution remains a separate release/acceptance gate. Security and performance findings are unchanged after excluding their observation timestamps; existing findings remain open.
