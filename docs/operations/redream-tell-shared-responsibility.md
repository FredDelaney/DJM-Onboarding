# Tell ReDream: explicit shared task responsibility

Status: local implementation, not deployed. Production is unchanged. Fresh-agency database compatibility and actual model/hosted acceptance remain required.

## Change

The existing `create_task` interpretation gains nullable `owner_names` for every explicitly named colleague. The old `owner_name` remains readable for cached single-owner plans. New names must occur in the quoted instruction. Each name uses the existing capture-scoped resolver and its own clarification key. No partial responsibility set is staged; duplicated identities collapse to one. Covered negation cases, malformed lists and unresolved collective requests remain for review. A beneficiary described as “for me” does not add the speaker; explicit shared speaker work does. The first responsible person remains the canonical task owner. Existing completion, rescheduling, confirmation, action hashes and Undo are retained.

The existing receipt shows both names under Responsible people before approval. Empty resolved payloads can fall back to proposed details only for pending/review/failed actions. Confirmed empty payloads do not promote proposed names or titles into saved facts. No SDK, dependency, schema, permission or configuration change is included.

## Local evidence

Eight new worker cases cover multiple names, explicit speaker/beneficiary distinctions, separate ambiguity and selection, malformed/unspoken/over-limit owners, cached plans/deduplication, non-Latin clarification keys, legacy resolver choice shapes and negated/collective instructions. The fresh-request test checks the actual structured schema and prompt. These are deterministic worker/provider mocks, not proof of model interpretation.

The existing Tell browser journey covers shared-name preview before approval, review-reason recovery, confirmed/proposed separation, partial success, explicit retry, task clarification, dismissal, Undo, exact links, account changes and four viewport widths. Logs and read-only catalog snapshots are under `/tmp/redream-platform-programme/tell-shared-owners*` and the two `tell-owners-catalog.json` / `tell-owners-access-catalog.json` files in that directory.

## Known staging prerequisites

Catalog reads on 28 October 2026 show three legacy global-staff prerequisites. Do not blindly replay historical migrations or overwrite a different hosted definition.

| Function | Current staging body MD5 | Required review |
| --- | --- | --- |
| `public.redream_ai_user_can_process(uuid,uuid)` | `191a1fdd1857e0f8c044bef69f256339` | Retain capture submitter, explicit enabled AI permission and canonical tenant-access checks; remove the unrelated global team requirement. Keep invoker mode and service-only execute. |
| `public.redream_ai_resolve_team_member(uuid,text)` | `56f154d95c0f71d53e080789ca7436c0` | Resolve only active staff in the capture tenant, including members without a global team row. Preserve matcher behavior, empty search path, definer mode and service-only execute. |
| `private.redream_ai_sync_task_responsibility()` | `8fdce43688adbaca651359b2441f2b34` | Validate every responsible person against current tenant staff, retaining atomic owner/responsibility synchronization, revisions and verification. Preserve trigger identity and metadata. |

The canonical `private.user_has_staff_tenant_access(uuid,uuid)` already checks active tenant, active membership and staff role, without a global team row; body MD5 `18cf9a31b7e202e28785e12972525cda`. Preserve it.

Next: inspect only adjacent claim/staging/approval guards needed by this path, define the exact forward repair, create its filename with the installed CLI, and verify fresh-agency/foreign/player/suspended/ended/disabled-AI denial, shared save, repeat calls and Undo in existing PostgreSQL patterns. Compare catalog/grants and original data before/after any authorised staging canary. Then verify exact deployed worker sources and one actual model-driven staged capture with explicit approval and cleanup. Group expansion to all staff, broader language evaluation, ordinary-staff, physical-device and independent-agency acceptance remain open.

No migration or worker deployment is authorised by this document itself. Continue under the existing staging-only programme boundary. Never replay `20260930142119_restore_redream_relationship_person_entrypoint.sql`; no production deployment, external send or real obligation is included.
