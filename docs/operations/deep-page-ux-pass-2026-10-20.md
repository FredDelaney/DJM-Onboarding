# Deep-page UX pass: 20 October 2026

## Reviewed journeys

| Surface | Result |
| --- | --- |
| Negotiation room | Bounded reads and Retry; failed reads cannot expose an empty negotiation form. Guardrail and brief shortcuts now reach their actual content. Read-only roles receive review wording. Missing monetary values stay missing. |
| Player service review | Bounded recovery, stale-read protection and a persistent return header. Capture errors remain separate from read failures. |
| Deal closeout | Same recovery and draft protection; balances stay separate by currency, recorded cents remain visible, and blank amounts never become zero. |
| Agency Memory | Same recovery; an empty history says so, and its heading describes activity and decisions without implying that learning has already occurred. |
| Club, contact and deal records | Existing disclosure, editing, return and navigation checks pass. Club amounts retain missing values, and the fallback next step no longer assumes an established route. |
| Player Profile | Existing compact/preparation/failure/link/layout checks pass. |
| Recruitment | List and detail layout checks cover phone and desktop widths. |
| Documents | Existing five-template tests cover recipient briefs, editable Word/PDF exports, draft recovery, sharing and invoice status. |
| Settings | Nine existing settings pages reviewed at phone and desktop widths. |

## Shared refinements

Long detail pages retain their selected record and Back action while scrolling. Page panels no longer inherit a drawer height cap. Compact headers leave room for content on short screens, including long record titles; the full heading remains in the accessibility tree.

Negotiation, review, closeout and history use stable read callbacks from the workspace. Read failures have their own state, so a failed save does not remove the user's editable draft. Retrying after a confirmed save refreshes data without repeating the write. Reads expire after twelve seconds; mutation behaviour and existing approval requirements are unchanged.

## Validation

- 1,821 automated tests pass, including currency separation, missing amounts and recorded zero balances.
- Focused browser recovery checks: all four rooms, four viewport sizes, expired reads, Retry, late responses, retained drafts, role restrictions and return navigation.
- Existing record, profile and document browser checks pass.
- Production layout checks pass for 68 screen/viewport combinations across detail pages, recruitment and nine settings pages.
- Typecheck and production build pass. Workspace entry: 142,583 gzip bytes against the 150,000-byte budget.

Fixtures use synthetic records and mocked requests. No schema, Supabase configuration, secrets, production records, permissions or deployment changes. Physical iPhone/Safari verification remains a release check.
