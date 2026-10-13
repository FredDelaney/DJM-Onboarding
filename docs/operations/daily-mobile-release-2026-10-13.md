# Daily mobile release, 13 October 2026

The five-part mobile workspace is Today, Search, Tell ReDream, People and More. People groups players, clubs and contacts. More keeps Calendar and other permitted work areas available without crowding daily navigation.

Record controls expose existing edits and recorded activity consistently. Editing is withheld until the current club/contact record has loaded successfully. Applied capture links retain their confirmed target and safe workspace return path.

The final ten product override stylesheets are consolidated in their original cascade order. The independent review confirmed that their CSS bodies are preserved exactly. Earlier football styles, the pitch and graphs remain intact.

## Fresh review and fixes

Independent read-only review of b7c49f6 found no critical issues and three important journey gaps. The fix pass:

- Reconciles a deal page with its selected URL, including cross-section opening and native Back/Forward. Commercial role restrictions are checked before resolving the page.
- Clears stale player intelligence when its selected player changes.
- Refreshes the current workspace after approval from mobile, tablet, desktop and empty-state capture launchers.
- Updates the standalone Find fixture to include the actual mobile navigation and People categories, preserving synthetic account/scenario controls.

Native Back and desktop approval checks were observed failing before the fixes, then passing. The targeted check also proves cross-section deal opening, direct deal selection and correct capture association across phone, tablet and desktop widths.

## Acceptance boundaries

Browser journeys use synthetic records and intercepted APIs. They do not prove physical iPhone/Safari acceptance or signed-in acceptance against DJM customer records. These remain explicit acceptance work when those environments are available.

No database migration, mailbox action, message sending or production data modification is required by this release.

Deferred minor: a pre-existing successful-save dismissal guard in EntityActionsMenu can leave an editor open where the parent does not unmount it. This is separate from the route and approval fixes.

Release only after the exact final pull-request head passes verify and browser_journeys. Confirm the merged SHA, READY state and production aliases on both projects, then check live public routes and runtime errors.
