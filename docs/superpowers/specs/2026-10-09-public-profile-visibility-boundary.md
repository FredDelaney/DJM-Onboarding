# Public player profile visibility boundary

Approved scope: user approval on 9 October 2026 to test a wider privacy-boundary fix in staging, then deploy it while preserving authorised player and staff access.

## Required behaviour

- Public club and player-profile HTTP responses must omit fields belonging to hidden sections, not merely hide their rendering.
- Section mapping: why_review -> why_review; stats -> key_stats and stats_meta; summary -> career_summary; career -> career_timeline; videos -> primary_video_url and selected_videos; experience -> notable_experience.
- Market value and its source URL are public only when hide_market_value is explicitly false.
- An invalid hidden_sections value must fail closed for optional sections. Unknown profile fields must not become public automatically.
- Public links remain available only for published, currently verified profiles; token links also require an active, unexpired UUID capability.
- Anonymous users cannot read raw player_public_profiles rows. Authenticated users can read raw rows only through the existing private.can_view_player(player_id) authorisation boundary.
- Preserve own-player, assigned-scout and same-tenant-admin reads, and existing authorised edits/publishing.
- Preserve approved document filtering, tenant branding, target-club scoping and tracking behaviour.
- Do not delete or rewrite customer profile content, rotate credentials, widen permissions, change other tables, or disable GraphQL globally.
- No new application dependencies or Vercel deployment is required for this backend change.
- Use an additive, CLI-generated migration; keep historical migrations intact.
- Use synthetic fixtures for positive tests. Production verification must not open real customer share tokens or create tracking events.
- Roll out only after failing regression tests, passing full local checks, independent review and staging verification.

## Current evidence

Repository main and owned checkout: 1225ab06e46dd7d81049849ab76f85baf42a5868, clean.
Production: xogoigaaskmuspiehkba. Staging: ltvmopvarlnidiozvpow.
Both have identical affected SELECT policies. Public table SELECT permits published verified rows to anonymous users and otherwise-unrelated authenticated users.
private.can_view_player checks own player or private.can_staff_view_player. The latter checks tenant-admin or active staff access plus explicit assignment.
No profile-dependent views or column grants were found in production.
Relevant raw-profile RPCs are service-role-only; the publicly executable policy helpers return booleans.
Existing club-share-public is missing in production. get_club_share returns hidden fields; deployed player-profile-public also returns the raw snapshot and can repopulate hidden key_stats.
Synthetic proof from 8 October: 22 boundary checks pass, then the actual club handler fails the hidden-content assertion.
