# Tell ReDream: explicit shared task responsibility

Status: shared-name worker/receipt implementation is prepared; three forward database migrations are installed and role-tested on staging `ltvmopvarlnidiozvpow`. The new worker and frontend are not deployed. Production is unchanged. Actual model, hosted UI and human acceptance remain required.

## Change

The existing `create_task` interpretation gains nullable `owner_names` for every explicitly named colleague. The old `owner_name` remains readable for cached single-owner plans. New names must occur in the quoted instruction. Each name uses the existing capture-scoped resolver and its own clarification key. No partial responsibility set is staged; duplicated identities collapse to one. Covered negation cases, malformed lists and unresolved collective requests remain for review. A beneficiary described as “for me” does not add the speaker; explicit shared speaker work does. The first responsible person remains the canonical task owner. Existing completion, rescheduling, confirmation, action hashes and Undo are retained.

The existing receipt shows both names under Responsible people before approval. Empty resolved payloads can fall back to proposed details only for pending/review/failed actions. Confirmed empty payloads do not promote proposed names or titles into saved facts. No SDK, dependency or settings value changes are included. The database prerequisite repair below changes five function bodies, six identity foreign keys and one existing SELECT policy; it preserves execution grants, table privileges and tenant authority.

## Local evidence

Eight new worker cases cover multiple names, explicit speaker/beneficiary distinctions, separate ambiguity and selection, malformed/unspoken/over-limit owners, cached plans/deduplication, non-Latin clarification keys, legacy resolver choice shapes and negated/collective instructions. The fresh-request test checks the actual structured schema and prompt. These are deterministic worker/provider mocks, not proof of model interpretation.

The existing Tell browser journey covers shared-name preview before approval, review-reason recovery, confirmed/proposed separation, partial success, explicit retry, task clarification, dismissal, Undo, exact links, account changes and four viewport widths. Logs and read-only catalog snapshots are under `/tmp/redream-platform-programme/tell-shared-owners*` and the two `tell-owners-catalog.json` / `tell-owners-access-catalog.json` files in that directory.

## Installed staging database manifest

Applied once through the staging migration service, with local filenames aligned to the actual returned ledger versions and identical SQL bytes:

1. `20261028082359_canonical_tell_staff_membership.sql`
2. `20261028082648_canonical_tell_settings_access.sql`
3. `20261028082835_scope_tell_settings_to_request_workspace.sql`

The second migration exposed the browser role's deliberate lack of membership-table SELECT access during actual staging acceptance. The third is its forward correction, using the unchanged SECURITY DEFINER request-workspace resolver. The current installed state includes all three. Do not install the intermediate policy by itself or edit/replay an already-applied file. Any future authorised promotion must preserve this complete ordered history and validate the final policy before enabling the release. This is not a production deployment instruction.

| Function | Reviewed old body MD5 | Installed body MD5 |
| --- | --- | --- |
| `private.redream_ai_sync_task_responsibility()` | `8fdce43688adbaca651359b2441f2b34` | `da8e108d9f867148055c3828437192d4` |
| `public.redream_ai_approve_capture(uuid)` | `96e9737dae1206f5d2ec1c7708c6b2d0` | `63db499ca33fc9b3fa892b21b37a9196` |
| `public.redream_ai_resolve_team_member(uuid,text)` | `56f154d95c0f71d53e080789ca7436c0` | `5ba91e3bbd2e0a59d61d4df5c934e472` |
| `public.redream_ai_task_context(uuid)` | `1dbc8c0cb8595276f1833661f9b6a14a` | `35bcdad6c96c17791ae060301da17158` |
| `public.redream_ai_user_can_process(uuid,uuid)` | `191a1fdd1857e0f8c044bef69f256339` | `207aca5ef6414ec03d432d58326acba4` |

The repair replaces global staff checks with the existing canonical helper. Resolution retains its matcher and optional legacy name, falling back to the factual profile name for current agency staff. Task context falls back only for a current owner in the same tenant. Responsibility IDs are sorted/deduplicated while retaining the explicit primary owner; equal responsibility sets do not create phantom revisions. The optional historical sync trigger is absent on staging and remains absent. Its function remains repaired for installations where that reviewed trigger already exists; no second writer is installed.

These existing identity constraints now reference `auth.users(id)` rather than `djm_os.team_members(user_id)`, retaining their names and deletion semantics:

| Table / column | Constraint | Delete |
| --- | --- | --- |
| `tell_djm_permissions.user_id` | `tell_djm_permissions_user_id_fkey` | CASCADE |
| `tasks.owner_user_id` | `tasks_owner_user_id_fkey` | SET NULL |
| `events.actor_user_id` | `events_actor_user_id_fkey` | SET NULL |
| `review_items.owner_user_id` | `review_items_owner_user_id_fkey` | SET NULL |
| `notifications.user_id` | `notifications_user_id_fkey` | CASCADE |
| `tell_djm_aliases.owner_user_id` | `tell_djm_aliases_owner_user_id_fkey` | CASCADE |

No rows, memberships, enabled-AI flags or names are backfilled. Every assignee still requires active agency membership and staff role. All function OIDs, owners, modes, volatility, search paths and ACLs are preserved. Table ACL/RLS, unrelated constraints and all 12 selected user triggers are preserved. Unknown function/policy/constraint drift fails closed before partial repair. Known final-state replay is covered locally.

The unchanged helper `private.user_has_staff_tenant_access(uuid,uuid)` has body MD5 `18cf9a31b7e202e28785e12972525cda`; the unchanged request resolver has body MD5 `c87c391eecb3d3918cb284edbba48423`. The final settings SELECT policy uses both through a statement InitPlan, requires the selected active staff workspace, and grants no membership-table read access or settings writes. Its expression MD5 is `f2df0a28e21e3f819134b8374a962dc5`. Settings values and table privileges remain byte-equivalent.

## Validation checkpoint: 28 October 2026

- Sixteen PostgreSQL regression cases pass, including legacy/no-trigger paths, explicit owner order, profile fallback, ambiguity, role/revocation/foreign denial, repeat approval, newer-edit Undo refusal, real function metadata and fail-closed replay guards. The settings fixture reproduces both historical read blockers before testing the final request-scoped policy without a membership-table grant. The unchanged low-level writer remains a boundary fixture; these tests alone are not full hosted pipeline proof.
- All 2,199 tests and all TypeScript projects pass. The previously completed unchanged application build/bundle evidence is reused: gzip 146,069 / 150,000 bytes. No new build/export/browser sweep was needed for the SQL-only increment. Frontend source `5c50402` full CI `40647013259` is green; final publication CI is required for this increment.
- The actual staging baseline created synthetic staff through the verified invitation/signup trigger and reproduced the legacy permission FK rejection. Every fixture was rolled back.
- `docs/operations/sql/redream-tell-staff-membership-canary.sql` then passes against the final hosted state with actual authenticated/service roles: typed capture intake/events, same-tenant colleague resolution, foreign-name exclusion, explicit shared primary owner/responsibility revision 1, repeat approval, creator not silently assigned, responsible colleague context/name, guarded creation Undo, question/answer alias, five staff processing roles, player/invited/suspended/ended/disabled-AI/foreign denial, and atomic denial when a colleague is revoked after preparation. All test records are rolled back. No model, provider, browser session or external send is involved.
- Fresh before/after row counts and row hashes match for all 24 selected original data projections, including auth identities/profiles, invitations, memberships, tasks, responsibility, Calendar projections, captures/actions/questions, notifications, aliases, events and audit records. The only intended permanent footprint is the reviewed catalog repair and three migration-ledger entries. Eleven adjacent/helper function definitions and metadata are unchanged; only the five listed bodies change. Exactly six selected FK references change.
- Security advisor groups/findings are unchanged. Performance advisors retain the baseline findings and add one settings-policy init-plan warning. A separate actual authenticated-role EXPLAIN canary confirms the final policy uses an InitPlan filter, evaluated once per statement; the settings table is a singleton. This evidence is retained rather than adding privileges or another migration merely to silence the lint. The warning remains visible. [Advisor guidance](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).

Logs/catalog snapshots/canary result and EXPLAIN assertion: `/tmp/redream-platform-programme/tell-membership-release-*`, `tell-membership-post-*`, `tell-membership-staging-canary.json`, `tell-settings-initplan-*` and `tell-membership-database.log`.

## Remaining deployment and acceptance

The shared-name worker change is in `supabase/functions/_shared/ai-process.ts`, imported by both `redream-ai-process` and compatibility `djm-tell-process`. Deploy neither to production here. Before an authorised staging worker installation, inspect the current hosted versions/dependency source and preserve their JWT/settings contract, deploy both matching wrappers with the exact reviewed dependency closure, and verify the returned hosted sources. Existing intake wrappers need no source change for this increment. Then perform one actual-model capture/clarification smoke check through the authorised UI, without approving a real colleague obligation or sending externally. The new receipt frontend also requires the quota-deferred staging deployment and read-only owner UI check.

All-staff group expansion, wider language evaluation, ordinary-staff browser, physical-device and independent-agency acceptance remain open. Unrelated global staff FKs in other domains remain SAS-01/SAS-02 follow-up; this scoped task path is not proof of complete no-developer agency onboarding. Keep all 46 programme and 17 UI rows; formal acceptance stays 2/63 (3%).

Never replay `20260930142119_restore_redream_relationship_person_entrypoint.sql`. This manifest adds no merge, production deployment, sensitive configuration change, external communication, real assignment, payment, share or signing authorisation.
