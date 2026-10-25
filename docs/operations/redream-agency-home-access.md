# Canonical agency Home and task access

Programme scope: SAS-04 / DAY-02 / UI-01, stacked on PR 261 at `5b8174da20e23752614820e3f447213877d33f7e`. The full 46-item / 17-surface programme remains open.

## Problem and resulting behaviour

The workspace registry already uses active agency membership. Personal Home, its owned-task feed and the task-owner trigger additionally require an active global `djm_os.team_members` row. A valid agency owner/staff member can therefore enter a workspace but fail Home and task creation because of an unrelated legacy record.

Remove only those four legacy joins across the three existing functions. Existing tenant status, active membership, allowed staff roles, task ownership, private review/edit scope, ranks, data contracts and service-only execution remain. There is no new role, API, global staff backfill, permission grant, profile change or task/membership rewrite. Staff removal uses the existing canonical writer, which sets the relevant membership to `ended`; that revocation still denies access. An inactive legacy global row alone is no longer an agency revocation mechanism.

The actual workspace registry, Calendar staff/assignee helpers and Home editor already use canonical agency membership and are unchanged. The actor is still authenticated by the existing Edge gateway, which resolves the requested workspace from server-read memberships before calling the service-only Home functions.

## Validation

The focused regression reproduces three old failures. After the patch, all 46 focused Home/statistics/task-context/editor database tests pass. They cover all five supported staff roles without a global row, default and explicit task ownership, inactive global rows, invited/suspended/ended or absent membership, player-role/empty identity/inactive-tenant denial, multi-agency task isolation and scoped revocation. Existing source-review, colleague-task admission, context grouping, task update/completion/Undo tests remain passing. Metadata, data preservation, exact legacy/current task-feed source variants, replay, service-only execution and unknown-body refusal are covered.

Final local `npm run check` passes 2,109 tests, every TypeScript project, production build and unchanged workspace gzip budget (144,563 / 150,000 bytes). No frontend source is changed. The test fixture now includes the real task-owner trigger and the canonical user-task execute ACL; it previously omitted that trigger and left the extracted task feed callable through its default fixture ACL. No production grant changes are required or made.

A fully rolled-back installed-staging canary independently reproduces original Home denial and canonical Tell task creation failure under actual `service_role`. It creates only a transient labelled agency/membership/permission/capture fixture around Jesse's existing account, makes the legacy global row inactive inside the transaction, then rolls all changes back. No auth user, model request, external send or persistent agency/permission/global-row change is involved. This is technical evidence, not real independent-agency or ordinary-staff browser acceptance.

Evidence: `/tmp/redream-platform-programme/agency-home-access-before.log`, `agency-home-access-after.log`, `agency-home-access-full-check.log`, `agency-home-access-before.json`. Installed post-patch acceptance remains pending.

## Exact staging manifest

Only `supabase/migrations/20261025082614_canonical_agency_home_staff_access.sql`, SHA-256 `b9121aadec70483fec48a7d73aa2074a25b79fba62394a36dca6a8602ff9a71d`.

| Existing function | Reviewed source MD5 | Patched source MD5 |
| --- | --- | --- |
| `private.redream_enforce_staff_task_owner()` | `cb1e1c8a44f6cf3762da1e14e108c328` | `70c4a00b3517ae136c3ed4b6fd23333f` |
| `public.platform_server_user_task_commands(uuid,uuid,integer)` staging variant | `b2cec93693b824128df375b7e7d7dce0` | `00ba3e3519f7f9cfa853a50faccc088f` |
| Same task feed, reviewed current context variant | `df2fff950cbac860e0b583b999a02536` | `a75e24785b5d9d8165e004be60a2c2c4` |
| `public.platform_server_personal_home_commands(uuid,uuid,integer)` | `7e40b31e3b3c521d7b59e438d898883a` | `ccfd7e63313290260efdbe033c5cb990` |

The migration preserves each reviewed implementation apart from its legacy joins. It refuses unknown bodies, retains OID/owner/ACL/configuration/security mode, is idempotent and sets local lock/statement limits. All three existing functions are postgres-owned, fixed-search-path definers; public feeds remain service-only and the private trigger's existing ACL remains intact.

Supabase staging only: `ltvmopvarlnidiozvpow`. No frontend, worker, provider, schedule, secret or configuration rollout. Frontend stays `10f7c91` / `dpl_8ZZMqEd2DiHMuhNYGKbvDkkA9KKX`; agency-os remains 61. Preserve original row hashes and advisor finding sets. Use one fully rolled-back fresh-agency Home -> canonical task -> update/complete/Undo -> scope/revocation canary after installation. Never replay history or execute excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`.

Production is read-only in this work. Its personal Home is still pre-programme MD5 `d423a50b964e9b572fbf30f52a50be4a`; this migration deliberately refuses that body until the separately reviewed prerequisite programme changes are applied. Production's task feed is the reviewed October context variant, while staging still has the older title-grouping variant. Preserve both here. OPS-05 must reconcile the context parity explicitly with a narrow forward change; do not replay the older whole-file migration or infer that context-grouping tests have already accepted the staging reader.

## Recovery and remaining acceptance

Private before-image/catalog/advisor/data backup is `agency-home-access-before.json`. If recovery is needed, compare exact installed hashes and restore only the reviewed function before-images with metadata checks; no table rewrite is involved. Do not automatically restore the known legacy access failure.

All 46 programme items and 17 UI rows remain retained. Full role/read-only/volume acceptance, onboarding, source-provider flows, physical iPhone/Safari and independent-agency working-day proof remain open. This increment establishes only the recorded Home/task boundary. No merge or production rollout.
