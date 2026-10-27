# Home quick tasks Implementation Plan

User request: make Home tasks easy to fill in and check off on a phone.

Keep the existing Home queue, responsibility picker and player review flow. Give ordinary follow-ups a comfortable completion circle and an Update panel with an action, due date and optional note. Player follow-ups may replace a completed action with a dated next action. Offer Undo after a confirmed completion. Keep drafts and rows on failed writes. Never clear player data review flags through a task tick.

1. Add a narrow, authenticated, tenant-scoped Home work RPC for legacy tasks and player next actions. Reuse calendar task permissions and revision controls for manual tasks. Lock canonical records, reject stale edits, audit internal outcomes and preserve verification. Test completion, editing, Undo, assignment permissions and tenant isolation using the actual migration.
2. Add a small Home control and editor, with direct completion, saved notes, date editing and Undo. Deduplicate canonical work and refresh both command and assigned feeds after writes. Test mobile completion, failures, retry, drafts, review links and touch targets in the real workspace fixture.
3. Run relevant browser checks, the full unit suite, type checking and production build. Obtain one independent review, apply the additive migration to staging and production, and release the tested frontend. Verify the live release.

Interfaces: the RPC returns a canonical work DTO and an expected-state snapshot. The Home controls pass that snapshot for every mutation. Calendar tasks retain existing private-content and revision semantics. No production task is completed during testing.

Source sync remains blocked by GitHub integration write permissions. Preserve the prior career approval fix in the local branch and deployment source package.
