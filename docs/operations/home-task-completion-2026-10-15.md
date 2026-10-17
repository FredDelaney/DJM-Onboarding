# Home task completion

Home now offers a direct completion circle and an Update panel for ordinary legacy tasks, player next actions and manual calendar tasks. The panel keeps the action, date and optional note together, with Today, Tomorrow and No date shortcuts. Completing a player follow-up may save a dated next action atomically. Confirmed completion offers Undo.

Data review flags and career approvals retain their existing protected flows. Completing a reminder does not verify player data. Duplicate command/assignment sources are shown as one canonical work item. Existing reply preparation and responsibility editing remain available.

The additive migration `20261014204053_home_task_completion.sql` provides an exposed invoker over a private definer with active tenant staff, owner/responsibility and manager checks. Writes lock the canonical record and require the exact read snapshot; calendar tasks retain their existing revision/privacy rules. Internal notes are held in tenant audit snapshots, not public player fields. Personal calendar content is not copied into agency audit snapshots. Player service writes change only next action, due date and timestamp, preserving football verification.

Undo checks the exact post-write state and audit event, and refuses to overwrite later changes. Network writes have a bounded confirmation wait and are never automatically retried. Failed or unconfirmed writes retain the draft and do not remove a row. Local confirmations are reconciled only after successful Home/operations and assignment refreshes, so reopened work is not hidden.

Verification:
- Actual migration tested against PGlite: completion, editing, persisted notes, next action, Undo, stale snapshots, dates, permissions and private calendar auditing.
- Real workspace browser fixtures: direct completion, double taps, retry/draft retention, saved notes, next action, Undo, task deduplication and mobile touch targets.
- Independent review found three concrete regressions: reply preparation, date-only calendar overrides and permanent local overrides. Each was reproduced by a failing browser check and fixed; all three regression scenarios now pass.
- Existing player review, responsibility layout, generic command recovery and career strategy approval browser checks passed.
- Authenticated staging completion and exact Undo passed inside an explicitly rolled-back transaction. No production task was completed during testing.

Release uses the production Vercel project and preserves the earlier career approval fix. GitHub source write permissions remain blocked; do not overwrite this release with the old Git main before syncing both local commits.
