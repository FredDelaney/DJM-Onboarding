# Players: multi-agent assignment directly from the roster

4 November 2026

## Product decision

The *Agents* column represents the actual people working with a player, not just a single accountable person. Multiple people may be selected, as in the supplied Athlivo reference. A separate *Lead agent* remains accountable for the player, and is included automatically in the displayed team. An independent *Player team* setting continues to control Home updates and reminders, not record access.

Clicking an Agents cell opens a searchable, mobile-safe selection menu. It shows each real agency teammate's name and photo/initials, marks selected people, keeps the lead selected, and saves the entire selection. The roster shows the overlapping photo/initial stacks and a count. Changing the team also updates the player profile, which has the same control. The Agent filter matches any assigned person, including non-leads.

## Data model

Migration `20261104103833_player_team_agents_v1.sql` creates private `platform.player_agent_teams` with tenant/player ownership, an explicit set of additional agents, a monotonically increasing revision and audit provenance. Existing lead agent assignments remain in `public.players.primary_staff_user_id`. A read helper returns the union of current lead and explicit team members, resolving canonical IDs, display names, and avatar paths from active agency memberships.

The three existing tenant-guarded player read models expose `identity.assigned_agents`. Restricted directory rows redact assigned agents. The new `redream_player_agents_v1` RPC is admin-guarded and uses optimistic revision checks, active staff validation, and audit events. It rejects stale changes, unknown people and cross-agency IDs. When an agent is added, they receive restricted player read access if they did not already have access. Removing an assignment never silently revokes other existing rights. No direct table grants are introduced.

In production, Dapo Kayode is an active agency member. Moses Makinde was not found under that name among active agency members at the time of the review. The app must not invent his user ID or silently assign someone with a different name. He becomes available after joining the agency through its normal invitation/account process.

## Verification

- Migration parsed successfully with `BEGIN ... ROLLBACK`, then was applied in staging.
- A staging authenticated admin read/write test exercised creating an additional assignment, confirmed it in the returned team and stored row, and rolled back the entire test with no lasting player changes.
- Focused browser QA passed for table management, multiple selected agents, immutable lead in the team selector, second-agent filtering, profile remove/edit and restricted player privacy. Tested at 320, 390, 768 and 1440 pixels.
- Full unit suite passed (2,350 tests).
- Platform-polish browser QA passed at 320, 390, 768 and 1440 pixels; the popover was visually inspected and fixed so it stays fully within the viewport.
- Existing Player page browser workflow passed at desktop and mobile sizes.

## Release safeguards

1. Complete GitHub CI for exact PR head.
2. Apply the exact reviewed migration to production before merging frontend.
3. Verify the new production read-model shape, RPC admin access, and no anonymous/direct table access.
4. Allow squash-merge only with all required CI checks green.
5. Verify both Vercel production deployments use the merged commit, and smoke-test both Players URLs.
6. Authenticated live multi-agent editing remains a separate QA boundary unless a signed-in production session is available.
