Athlivo-inspired club request triage and restricted-role prefetch protection | 3 Nov 2026

Purpose: Athlivo's October club request guide describes priority and deal-type filters. ReDream stores those fields but previously lacked quick request filters. A post-merge GitHub browser test also intermittently observed a private market request while switching from an owner session to restricted staff.

Changes: Opportunities > Needs has priority (High/Urgent, Normal, Low/Routine, Unrecorded) and deal type (Permanent, Loan, Free Agent, Unrecorded) selectors; filtered count and Clear filters. Current club/position search, editing, request identity and backend are preserved. Unknown values stay unknown. Deep-linked requests reset stale filters. The workspace stops speculatively preloading private Opportunities and continues to load only on explicit owner/admin navigation.

Quality: 2,333 existing and new unit tests passed before the final source regression was added; TypeScript passed. The restricted-role browser regression passed agent, scout and operations, including private-read checks. Requests and deals browser QA passed at 320, 390, 768, 1440px, including filters, editing, salary warnings, missing coverage, expiry, identity and action flow. Mobile and desktop filter screenshots were inspected. No database migration or live data writes.

Still missing relative to Athlivo: structured transfer window, min/max budgets, multiple accepted deal types, automatic roster matching and a complete shortlist -> pitch -> pending -> accepted/declined history on club and player. This release is a narrow improvement, not full parity.

Release: GitHub CI (unit/TS/build/bundle/workflows/visual) must pass before merge; verify production Vercel SHAs, live endpoints and runtime logs after merge. Real signed-in staff-role acceptance remains separate from browser fixtures.
