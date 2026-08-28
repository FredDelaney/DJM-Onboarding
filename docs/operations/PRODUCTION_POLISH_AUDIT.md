# Production polish audit

Date: 28 August 2026

## Scope

This pass covers the production DJM Player application across admin, DJM OS, player, onboarding, profile, club-share and club-facing dossier surfaces. The goal is to keep the existing product structure while making the visual system more consistent and safer on iPhone-sized screens.

## Responsive findings

- The application already has good iPhone foundations: `viewport-fit=cover`, safe-area use, `100dvh`, 16px mobile form text and bottom-nav safe-area handling.
- The root layout loads eleven CSS layers before this pass. Those layers contain overlapping spacing, control-height and breakpoint rules. Refactoring all of them at once would create unnecessary production risk.
- Mobile breakpoints vary across 760, 700, 680, 520, 480, 430, 420, 390, 380 and 360 pixels. The final responsive contract normalises the important behaviours without removing the existing component-specific work.
- Several interactive controls were below the recommended 44px touch target, especially product tabs, research links, compact admin actions and club-share controls.
- Some sticky UI used hard-coded top offsets and could compete for vertical space on iPhone. The mobile audit makes the admin command toolbar non-sticky while preserving the primary workspace header.
- Horizontal tab and metric rails needed consistent touch scrolling, overscroll containment and scroll padding.
- Player identity and club-facing hero typography needed a smaller-screen ceiling so the first viewport is useful rather than dominated by one hero.
- Bottom sheets already used safe-area bottom padding, but their maximum height did not consistently account for the top safe area.

## Implemented responsive contract

- One final `responsive-polish.css` layer is loaded last.
- Shared spacing and touch tokens are introduced without rewriting legacy CSS.
- Touch targets are at least 44px on coarse-pointer devices for the main action classes.
- Mobile form controls remain at least 52px high and 16px text to avoid iOS focus zoom.
- Workspace tabs stay horizontally scrollable so Club Profile and Documents remain reachable on player mobile.
- DJM OS page gutters, header spacing, panel radius and action wrapping are normalised.
- Player bottom navigation keeps iPhone home-indicator clearance.
- Profile and club-share bottom sheets account for top and bottom safe areas.
- Small iPhones get reduced hero height and type scale while preserving player photography and the football presentation.
- Landscape phone rules reduce oversized hero sections.
- Focus-visible treatment is strengthened for keyboard accessibility.

## Security findings

The Supabase security advisor reports broad GraphQL discoverability because many internal tables grant `authenticated` access. A sampled policy audit confirmed the sensitive tables are still protected by row-level security that checks DJM team membership, admin status, ownership or player-specific access. Removing those grants globally would break current direct-table application flows and is not justified by the advisor count alone.

The following SECURITY DEFINER functions were inspected:

- `create_player_invitation`: authenticated only and explicitly requires admin access.
- `djm_attach_whatsapp_thread`: authenticated only, requires active DJM team membership and verifies thread ownership.
- `get_club_share`: intentionally public and guarded by an active token, expiry and published verified profile checks.
- `track_club_share_view`: intentionally public and guarded by the same share constraints.
- `validate_player_invite_v2`: intentionally public for the private invitation flow.
- `validate_player_invite`: legacy predecessor. The live join page uses v2, so public execution is removed in this pass.

`notification_outbox` has RLS enabled with no client policy and no anon/authenticated SELECT grant. That is consistent with a service-only outbox, so no permissive policy is added merely to clear an advisor warning.

`pg_net` is installed in the public schema and is not relocatable in this project. It is therefore not moved in this pass.

Leaked-password protection remains a Supabase Auth configuration item and should be enabled from the Auth security settings when operationally appropriate.

## Performance hardening

Five missing foreign-key support indexes identified by the live advisor are added:

- `djm_os.entity_links(created_by)`
- `djm_os.league_benchmarks(updated_by)`
- `djm_os.player_scorecards(updated_by)`
- `public.club_share_links(organisation_id)`
- `public.club_share_links(source_person_id)`

Unused-index warnings are not acted on in this young application. Low usage does not yet prove an index is unnecessary.

## Release validation

Before merge:

1. Run `npm run check`.
2. Confirm Vercel preview is READY.
3. Check iPhone widths at 390px, 393px and 430px, plus a narrow 360px fallback.
4. Check landscape phone height around 430 to 520px.
5. Verify admin Command, Players, Club Contacts, Market, Deals and Brain navigation.
6. Verify player Today, Career, Check-in, DJM, Club Profile, Documents and Me navigation.
7. Verify profile editor and club-share bottom sheets with the iPhone home indicator area.
8. Verify sign-in, invitation and onboarding controls do not trigger Safari zoom.
9. Apply the included Supabase migration once the source migration exists on the release branch.
10. Re-run Supabase security and performance advisors after migration.
