# Player pages: roster, work view and profile visual refinement
3 November 2026

## Problem
The roster was a sparse row/card with unclear primary navigation, little information hierarchy, competing metadata and no clearly labelled way to open the actual profile. The player work view and public-profile editor used a different visual rhythm from the recently refreshed club pages. Narrow widths compressed the roster search.

## Changes
- Our Players has a light, branded roster header with the actual directory count, a concise hierarchy and uncluttered search/create controls. The header changes appropriately to Recruitment when switching tabs.
- Player rows now prioritise photo, name, position, club and nationality/age when recorded. Contract and active opportunity indicators show the saved values without invented defaults. The next-action area remains separate from general identity.
- Each player row retains its existing click/keyboard access, adds a prominent explicit **Profile** button and preserves **Work view** and the existing edit/manage menu.
- The work view has a clear All players return, a light player hero, readable actions, calm tabs and cleaner work cards.
- The Player Profile publishing editor shares those surfaces, with the main verify/share action presented before supporting actions. DOM focus order matches visual order on mobile. Preview, edit, AI assistance, More, profile photo, team and publishing functionality remain in place.
- Small-screen search and Add player spacing corrected for a 320px viewport. No new data model, integration, role or write API.

## Validation
- Before/after screenshots captured for 390px mobile and 1440px desktop, with actual rendered fixtures. Work view and profile editor also inspected visually on both.
- Platform polish browser QA passed for Players at 320, 390, 768 and 1440px. It checks search/add controls, Profile/Work view touch targets, horizontal overflow, recruitment header and workspace tools.
- Player Profile QA passed at 320, 390, 768 and 1440px: verify/publish and edit remain present with usable controls, no horizontal overflow.
- Full local npm run check passed: 2,339 unit tests, TypeScript checks, optimised production build and client bundle budget (149,838 of 150,000 gzipped bytes).
- No production database writes. Actual signed-in agency-record acceptance remains to be verified after merging and deploying.

## Release
Require GitHub verify and browser visual/workflow gates. Merge through protected PR, then verify both DJM Player and ReDream Systems production Vercel deployments have the merge SHA and no runtime errors. Do not claim authenticated end-to-end production testing on real player records until completed.
