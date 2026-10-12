# Connected mobile polish, 12 October 2026

Continue the compact, calm page design from the open mobile polish branch. Home keeps readable action labels, context on request and quiet responsibility controls. Responsibility editing expands inside the row rather than floating outside a phone screen. Selection, search, removal and confirmation controls retain comfortable touch targets.

Calendar dates and player profile actions keep usable touch targets. Deal, negotiation and business detail screens follow the same light visual hierarchy as the workspace. Existing player, admin, sharing and approval flows remain in place.

Shared work and Calendar links now select their actual player, deal or club need. Older club, contact, recruitment and deal URLs retain their record identifier when redirecting to the current workspace. Missing record context retains the existing list destination.

Verification:
- 1,647 automated tests passed.
- Production build and TypeScript checks passed.
- Player profile editing controls, status labels and readiness details passed browser contrast checks at 320, 390, 768 and 1440 pixels, with at least 44-pixel control heights.
- Browser screenshots use portable temporary paths on macOS and Linux.
- Home labels and expanded responsibility editing passed at five viewport widths.
- Player data refresh, reload recovery, sourced correction, conflict handling, verification, read-only access and custom statistics handoff passed.
- Calendar task creation/editing, shared assignment, complete/reopen, archive/restore, undated work, retained drafts, nested dialogs and stalled-read recovery passed.
- Assignment save/reload/removal/conflict recovery and stale-read protection passed.
- Customer entry, Find, player portal and deep workflow recovery checks passed.
- 236 screen/viewport combinations passed across main pages, detail pages, settings, capture, recruitment, onboarding, public profiles and public pages.

Previously omitted browser checks are included in the standard browser release command. Their selectors now follow the current simplified copy and collapsed notes/details controls, while preserving the data, permission and recovery assertions.

Browser workflows use synthetic records and intercepted APIs. Live release checks confirm deployment commits, domain assignment and route availability; they do not send messages or change customer records. No database or authentication changes are required by this pass.
