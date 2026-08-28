# DJM authenticated iPhone QA pass

Date: 28 August 2026

## Scope

This pass follows the production responsive overhaul and focuses on authenticated player and staff workflows at iPhone breakpoints.

Because no reusable production login credentials or browser automation runtime are available in the connected environment, this pass deliberately does not create fake production users. Verification is based on:

- the live production shell and production deployment,
- the exact authenticated React source currently on `main`,
- the final CSS cascade currently on `main`,
- the actual mobile breakpoints and DOM structure used by player and admin screens.

## Verified issues corrected

1. **Career editing action hidden on mobile**
   - `player-premium.css` hides `.career-section-heading > .btn` below 700px.
   - The Career record uses that button for `Update record`.
   - The final QA layer restores the action as a full-width 48px control.

2. **Admin signed-player opportunities required an 850px horizontal pan**
   - The admin mobile stylesheet retained `.admin-opportunity-row { min-width: 850px; }`.
   - The phone QA layer converts each opportunity into a stacked card while preserving club, player, next action, stage editing and open-detail action.

3. **Several icon-only actions were narrower than 44px**
   - Height was generally protected by the first responsive pass, but explicit 34px/36px widths remained on some modal and row actions.
   - The QA layer makes those controls at least 44 x 44 on coarse pointers.

4. **Modal safe areas were inconsistent**
   - Profile and club-share sheets were already protected.
   - Admin invite, DJM search and quick-capture surfaces now also account for the top safe area and bottom home indicator.

5. **Small-iPhone career metrics were dense**
   - Career timeline metrics switch from three columns to two below 390px.

6. **Landscape notch gutters**
   - Authenticated player and DJM OS primary containers now use the physical safe-area insets in landscape.

7. **Horizontal rails**
   - Admin tabs/metrics/pipeline, player career lanes, toolkit categories and workspace tabs use iOS momentum scrolling, overscroll containment and light scroll snapping.

## Deliberately not changed

- The player command hero height was not reduced in this patch. Static inspection shows its absolute content and readiness card depend on the existing vertical reserve; without a real authenticated visual session, shrinking it would risk overlap.
- Dense DJM OS intelligence layouts were not broadly rewritten because their existing 760/480 breakpoints already collapse correctly.
- No database, permissions, RLS or production data changes are included.
- No fake player or staff account was created for QA.

## Source text guard observation

The repository's `precheck` currently runs the text sanitizer before the U+2014 checker. That means committed source can contain U+2014 and CI will silently normalise it in the build workspace before checking. Production output is therefore sanitised, but source hygiene is weaker than the intended repository rule.

This should be tightened in a separate source-cleanup commit after all current U+2014 occurrences are removed from source, so CI can fail on regressions rather than rewriting them.
