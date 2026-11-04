# Players: connected agent, filter and profile refinement

4 November 2026

## What changed

This pass builds on the merged and deployed Players redesign, using the supplied Athlivo screenshots as layout and interaction references while preserving ReDream branding.

- The roster's **Agent** column now reads the actual primary agent assigned to each player, not guessed or empty fields.
- Player rows show recognised club crest images where a suitable approved source exists, with a safe fallback. Nationalities show flags and labels.
- Filters are grouped by Agent, Position, Status, Agency contract, Club contract, Clubs, Club country, Nationality and Stage. The filter popover shows active categories. Values come from the loaded player dataset and recorded fields. A note makes clear when filters are scoped to loaded pages instead of claiming a whole-database filter.
- The Player profile includes an **Lead agent** card with a searchable, accessible editor. Admins can choose an active teammate or leave unassigned, then Save or Cancel. This is separate from reminder recipients in the existing **Player team** component, and from player relationship status.
- The lead-agent editor verifies the saved player and selected staff ID; stale writes are rejected and unconfirmed writes require reloading. Existing player access is never silently removed. New leads receive staff-player access with a restricted default, as existing authorisation requires.
- On mobile, the editor opens as an accessible fixed bottom sheet with usable tap targets and all controls visible.

## Supabase contracts

Migration `20261104092849_players_real_agent_assignment_v2.sql` extends the existing three player read models with `identity.primary_agent`, which is resolved from `players.primary_staff_user_id` and `profiles.display_name`. The paged directory deliberately hides this field from restricted staff. The new `redream_player_lead_agent_v1` RPC enforces tenant access and administrator authority, validates selected staff and expected previous lead, calls the existing audited `djm_assign_player` writer, and adds only the restricted access needed for newly assigned staff.

No player data is changed by the migration itself. Staging migration and read/write SQL transaction checks passed; the write test rolled back all changes after verification. The staging test tenant has only one active staff member, so a two-person reassignment and the new-access insert are exercised through code/browser fixtures but could not be exercised with two actual staging users. No signed-in live user write has been claimed.

## Evidence

- All 2,346 unit tests passed locally.
- TypeScript passed.
- Player priorities browser workflow passed, including agent assignment, roster update, agent filtering, statuses, restricted records, and 320/390/768/1440 layouts.
- Player experience browser workflow passed at 1440 and 390.
- Platform polish visual/accessibility checks passed at 320/390/768/1440 after correcting touch target sizes and guidance text.
- Existing club crest API is reused; logos are not fabricated.

## Remaining boundaries

These filters operate on the currently loaded directory pages. Server-side comprehensive search/filter by category requires a separate paged query API if the roster becomes large. Notifications and tagged staff remain different from the accountable lead agent, by design. Contract, deal and document records remain on their existing tenant-protected read models; this pass does not invent missing match fixtures or claim to verify external communication integrations.

## Release checklist

1. Apply the reviewed migration to production before the frontend merge.
2. Verify the production read-model outputs and no anonymous execute permission on the new write.
3. Merge only after complete GitHub CI, browser workflows, and visual checks pass.
4. Confirm both Vercel production deploys are READY on the exact merged commit.
5. Smoke-check the public app routes; authenticated production UI changes still require a signed-in live QA session.
