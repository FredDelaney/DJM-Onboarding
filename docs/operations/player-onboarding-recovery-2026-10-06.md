# Player onboarding recovery and atomic saves, 6 October 2026

## Next step in the sellability plan

Prove the invitation, password recovery and first-login hand-off with a controlled pilot before inviting paying agencies. Code and fixture checks are prerequisites, not evidence of real mailbox delivery or billing settlement.

Current main was reconciled at fd512ae before this change. The separate feature/agency-os-core-loops-v2 worktree and staging agency-os v34 were deliberately preserved.

## Failures reproduced

The production onboarding page previously ignored read errors, advanced Back after a failed save, and used separate writes for the player, private details, progress and video. A failed video insert could leave onboarding marked submitted. Executing browser checks reproduced all three behaviours before the repair.

Additional regression checks exposed unassociated form labels, private-only concurrent edits being overwritten by old drafts, and agency-verified/completed onboarding being reopened by a late save.

## Repair

- A single player_save_onboarding transaction commits or rolls back the profile, private details, progress and optional highlight video together.
- The public writer is SECURITY INVOKER. Existing RLS and protected-field triggers still apply. It accepts only onboarding fields and explicitly checks the current auth.uid(), owned player, tenant, active tenant, archive and retirement boundaries.
- The private boolean ownership lookup uses SECURITY DEFINER only to inspect the unexposed platform tenant status. It returns no customer records, has an empty search path and is not executable by PUBLIC or anon.
- Player and private-row version checks reject stale drafts instead of overwriting agency edits. Completion is idempotent and submitted, verified and complete states cannot regress.
- Loading errors have an explicit retry screen and never become editable empty private records. Queries select only the onboarding fields and scope ownership and tenant before retrieval.
- Reads and saves have deadlines, lifecycle cancellation and an immediate submission lock. Save errors preserve the visible draft; uncertain or conflicted saves require explicit reload.
- Back changes steps only after a confirmed save. Optional video drafts resume after navigation and reload. Footage is added to the existing private player_videos table only on completion, with retry deduplication.
- All 28 inputs have associated labels. Optional fields remain optional. No readiness, quality, publication or transfer-value rules were relaxed.

## Verification and rollout

Executing PGlite tests run the actual migration under authenticated RLS, including denied ownership, tenant, archived, retired and suspended contexts; allowlist and validation failures; concurrent private edits; video failure rollback; idempotent completion; late drafts; anonymous ACLs; and revoked write policies.

The real Next.js onboarding page is exercised against a local, fully intercepted backend. Browser checks cover read/private-read failure recovery, failed Back, video rollback/retry, all four steps and labels, saved-video resume, explicit conflict reload, repeated clicks, safe tenant-scoped queries and 320/390/768/1440 px widths. CSP bypass is confined to the isolated local-backend fixture; production headers are unchanged. This check is included in npm run check:browser.

Release order: review the change, apply the additive migration to staging, check definitions/ACLs/advisors, apply the same migration to production, merge through required verify and browser_journeys CI, and verify both Vercel production aliases at the merged main SHA. Exact release and deployment evidence is recorded in the accompanying pull request.

No real emails, customer accounts or payments are created by these tests. No Edge Function redeployment is needed.

## Remaining pilot requirements

Jesse must nominate the recipient email and pilot agency/player before a real invitation or recovery email is sent. Then check actual inbox delivery, link expiry and first login with that recipient. Do not describe this as completed from intercepted fixtures.

Existing security-advisor findings remain a separate backlog: RLS-enabled/no-policy internal tables, pre-existing exposed authenticated security-definer RPCs and leaked-password protection configuration. This release does not claim to clear that backlog or prove payment settlement.
