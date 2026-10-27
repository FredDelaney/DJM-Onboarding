# ReDream owner branding contract recovery

Status: migration applied and existing writer canary-validated on staging; production unchanged. This is an OPS-01 follow-up to PR 251, not an expansion of its two-migration manifest.

## Verified impact

Production lacks `public.platform_server_owner_update_branding(uuid,uuid,text,text,text,text,text,text,text)`, while deployed `agency-os` 43 calls it for `account_agency_save`. The caller already authenticates the user, resolves the tenant server-side and requires its owner role. Thus owner agency-branding saves have a real missing dependency.

Staging already has the canonical writer from `20260915131901_add_agency_owner_launch_workspace_v1.sql`, with `md5(prosrc) = 57f28fb8730e57ef89babec7ff8c2d23`, an empty search path and execute restricted to its owner and `service_role`. Preserve it.

## Reconciled older contract inventory

All 11 catalog absences below were confirmed read-only on 23 October 2026. A missing source contract is not automatically a broken deployed path.

| Missing contract | Source caller | Actual deployed evidence | Remaining action |
| --- | --- | --- | --- |
| `platform_server_owner_update_branding` | `agency-os`, `agency-launch` | `agency-os` 43 directly calls it; launch is absent | Restore this proven live dependency through the guarded migration below. |
| `platform_server_owner_launch_workspace` | `agency-launch` | Worker absent | Review required dependencies and validate fresh-agency launch before deploying it. |
| `platform_server_owner_create_first_player` | `agency-launch` | Worker absent | Retain as onboarding work; no permissive stub. |
| `platform_server_owner_create_first_relationship` | `agency-launch` | Worker absent | Retain as onboarding work; no permissive stub. |
| `platform_server_owner_create_first_opportunity` | `agency-launch` | Worker absent | Retain as onboarding work; no permissive stub. |
| `platform_server_create_player_portal_invite` | `agency-adoption` | Worker absent | Review invitation dependencies before deployment. |
| `platform_server_public_demo_snapshot_v1` | `redream-public-sandbox` | Worker absent | Retain public-demo validation; do not invent a working hosted demo. |
| `platform_server_can_deliver_tenant_notification` | `dispatch-player-push` | Downloaded version 19 does not call it | Review its actual older implementation and tenant boundary before promoting the source worker. |
| `platform_server_email_tenant_context` | `dispatch-djm-email` | Downloaded version 15 does not call it | Review its actual older implementation and tenant boundary before promoting the source worker. |
| `platform_server_player_stats_freshness_rows` | `weekly-player-refresh` | Downloaded version 20 does not call it | Review current freshness behavior before promoting the source worker. |
| `platform_server_recoverable_invite_auth_user` | `accept-player-invite` | Downloaded version 22 does not call it | Review actual invite/recovery behavior before promoting the source worker. |

This inventory is reconciliation evidence, not acceptance of those older workers' security or functionality. The remaining ten contracts, onboarding, providers and independent-agency acceptance remain in the master plan.

## Exact follow-up manifest

Only `20261023143715_restore_owner_branding_contract_v1.sql` belongs to this follow-up. No worker deployment, secret, Supabase configuration, schedule, backfill or customer-data mutation is needed to install the contract.

The migration reuses the canonical owner-membership guard, branding validation, narrow update and before/after audit implementation unchanged. It restores an absent function with server-only execute. An already-matching staging function keeps its OID, definition, owner and ACL. Unexpected existing definition, search path or browser execute grants cause a deliberate failure. Do not replay the full historical launch migration or install its unrelated writers.

## Validation and release gate

Six real PostgreSQL tests verify browser denial even with an owner's UUID; successful server/owner saves; other-agency/role/suspended-owner denial; atomic input-validation failure; accurate before/after audit evidence; preservation of other agency branding/assets; staging replay without writes; and unknown configuration/grant refusal. Membership fixtures enforce the canonical role/status checks. Fourteen existing account/launch checks also pass.

After full checks/review, preserve canonical ledger version `20261023143715` during staging-first application. Confirm the working staging writer and customer rows are unchanged, and test actual owner-save/recovery only with an isolated staging fixture. Production installation and any customer-facing promotion require their explicit release gate. No customer branding save is authorised as a production smoke test.

Staging result: canonical version `20261023143715` is recorded. The existing writer retains OID `26209`, body hash, owner, empty search path and exact ACL. The rollback-only canary saved normalized branding for a newly created synthetic agency, verified its audit event, rejected browser/cross-agency callers and preserved the other agency. Every canary write was rolled back; actual branding-row hashes are unchanged. Production still lacks this contract and has not been modified.
