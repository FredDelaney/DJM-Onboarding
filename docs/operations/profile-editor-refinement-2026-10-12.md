# Populated profile refinement, 12 October 2026

This follows the page hierarchy release and focuses on a profile containing season history, source links, communications and club shares.

## Changes

- Edit profile is directly available beside the primary profile action.
- Story, Presentation and Video sections share one retained draft. Visibility buttons expose their selected state.
- Video add/remove refreshes recorded footage without resetting presentation edits.
- Successful Save updates the current profile and its scoped cache. A late secondary response is preserved when the save finishes.
- Save status and failures appear inside the editor. Pending mutations disable fields. Escape, Tab containment and focus return keep keyboard use within the editor.
- Long club names and follow-up titles wrap. Season statistics share one quieter surface.
- Short viewports scroll the whole editor, keeping every action reachable.

## Verification

`npm run check` passed: 1,649 tests, TypeScript checks and production build.

Header contrast/touch checks and populated-profile browser checks passed at 320, 390, 768 and 1440 pixels. Browser coverage includes long facts, direct editing, draft retention during footage mutations, visibility settings, Save/reopen, slow-save focus, failed-save recovery, read-only access and 390 by 320 action reachability. A deterministic progressive-load case checks that club links and communication arriving during Save survive.

These checks use synthetic records and intercepted service calls. They do not modify customer data. The populated browser check is included in the regular browser CI command.

Independent review findings were fixed and covered before release. No database or permission-policy changes are part of this release.
