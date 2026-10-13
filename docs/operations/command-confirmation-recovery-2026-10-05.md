# Command confirmation recovery

## Evidence

The 12:33 iPhone recording shows a rejected task confirmation and then a generic Agency OS error on Home. Production logs at 10:34:28 and 10:34:32 UTC identify `proposal_expired`. The pending complete-task approval expired on 30 September. Preparing the same command reuses its idempotency key without renewing its expiry. The Edge handler treats the plain PostgREST error as an unknown exception, and the workspace renders its error behind the modal.

Birthday and calendar requests in the same recording returned HTTP 200. A briefly visible birthday loading state is not evidence of a failed birthday record. No birthday data, task records or production settings were changed during diagnosis.

## Changes

- Additive migration revalidates the live command and renews only expired pending approvals. Valid approvals keep their existing deadline. Applied approvals retain their status, payload and expiry, preventing repeat execution.
- Preserve tenant-membership checks and service-only function execution. Attribute a pending review to the staff member performing it.
- Return explicit HTTP 409 recovery guidance for expired approvals and commands that are no longer actionable.
- Render confirmation failures inside the dialog. Body portal, tenant colours, inert background, focus trap and focus restoration keep it above navigation and floating controls. Session loss clears the confirmation and releases background interaction and scrolling.

## Verification

Regression tests first reproduced stale expiry, overwritten applied payload, stale reviewing actor, generic HTTP 500 and a hidden dialog error. The keyboard and session checks additionally reproduced missing opener-focus restoration and a locked sign-in screen after session loss. Tests execute the real preparation SQL, real Edge HTTP handler and real operating workspace, with external API responses isolated in non-deployed fixtures.

Run `npm run check` and `CALENDAR_CHROMIUM=/path/to/chromium node scripts/calendar-browser-fixture.mjs`. Without the runtime dependency bundle, install Playwright separately for browser checks. The fixture temporarily installs Pages routes and removes them afterward; never commit those temporary routes or Next-generated development type changes.

## Release

The database migration and Edge deployment below are already complete. The remaining release work is the frontend merge and signed-in phone verification:

1. Completed: apply `20261005111734_renew_expired_command_approvals.sql` through the normal migration workflow. Do not apply it a second time.
2. Completed: deploy `supabase/functions/agency-os` with its existing JWT configuration unchanged.
3. Merge the tested frontend branch and confirm both production deployments are Ready.
4. On an authorised phone session, open a pending task, review the freshly prepared approval and confirm it. Verify completion exactly once. Let a separate approval expire and verify its error is readable with Cancel available. Check birthday editing, calendar creation and tenant switching.

Do not silently execute newly prepared approvals or extend approval validity during execution. A fresh review still requires explicit user confirmation. Database and Edge production updates are not applied by the downloadable Git patch.

## Production update, 5 October 2026

Approved by the user's follow-up to the production-update permission request. Migration `20261005111734` is applied on production project `xogoigaaskmuspiehkba`. Agency OS version 29 is ACTIVE and its deployed source matches the tested source. JWT verification remains enabled. Browser and anonymous execution of the preparation function remain denied; service execution remains allowed.

The real expired pending approval was successfully renewed inside a rolled-back production transaction, without executing its task or leaving smoke data behind. The frontend patch has not yet been merged. Both production frontend deployments still require the user's manual GitHub update before the dialog changes are live.
