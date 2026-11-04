# Players directory: include recruitment targets

4 November 2026

## Decision

The Players roster combines agency player records with unlinked recruitment targets without merging the underlying database records. Recruitment entries have the display-only **Prospected** label and their existing recruitment stage. The canonical agency status remains limited to Signed, Prospect and Mandated. This release adds no database status.

Recruitment rows open the existing recruitment target workspace. The Back action returns to the Players roster when launched there. The separate Recruitment workflow remains available. Linked targets are omitted by the existing backend and the UI adapter. Names alone are never used for deduplication. Agent assignment controls remain limited to actual agency players.

Only roles already authorised to work with recruitment see these entries, using the existing tenant-scoped agency-os reader. The frontend displays an error and Retry if recruitment cannot load rather than misrepresenting it as an empty list. At 500 records the UI warns that paging will be needed.

## Verification

- Live database read: 10 active player records and 14 unlinked recruitment targets; the existing recruitment board returned all 14.
- Six focused regression tests cover the two record types, duplicate avoidance, permissions, status semantics and error handling.
- Players responsive browser QA passed at 1440 and 390 pixels, including Prospected filtering, opening recruitment and returning to Players.
- Production build and original bundle budget checked. GitHub CI and exact deployment must be verified before claiming the release live.
- No Supabase migration or change of permissions is needed.

## Follow-up boundary

The existing recruitment promotion writer currently creates a player without explicitly setting its agency_status. Since the default is Prospect, a future reviewed backend correction should align confirmed representation promotions with Signed. This release does not silently change that writer.
