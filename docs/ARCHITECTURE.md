# Architecture

## Front end

Next.js App Router. Player routes are mobile-first and installable as a PWA. The service worker deliberately does **not** cache authenticated player data; it exists for app lifecycle and Web Push only.

## Authentication

Supabase Auth. New players are invite-only. DJM staff emails are authorised through `admin_allowlist`. Roles are `player`, `admin` and limited `scout`.

## Data separation

- `players`: master football record
- `player_private`: private career / mobility / contact information
- `weekly_checkins`: player weekly context
- `player_requests`: DJM requests, player messages and hidden internal signals
- `player_cv_settings`: editable club-dossier draft
- `player_public_profiles`: intentionally published recruitment snapshot
- `player_documents`: private or explicitly club-shareable files
- `player_opportunities`: club interest / placement pipeline
- `player_agreements`: representation and authority records
- `player_source_refreshes` + `player_source_suggestions`: external-source review workflow

RLS protects direct browser access. Protected-field triggers prevent players from changing agency-only state such as verification, priority or publication controls.

## Push notifications

1. Browser registers `/sw.js`.
2. Player opts in; Web Push subscription is stored in `push_subscriptions`.
3. Admin-created requests/announcements create `notification_outbox` records.
4. `dispatch-player-push` sends queued notifications using server-side VAPID credentials. Browser calls are explicitly admin-authenticated; scheduled calls use a separate secret held in Supabase Vault.
5. Supabase Cron queues missing weekly check-in reminders every Monday at 08:00 UTC and invokes the same dispatcher.
6. Expired subscriptions are automatically disabled.

## Club sharing

`/p/[slug]` is the intentionally published profile. `/s/[token]` uses tracked, optionally expiring share links. Club-shareable private documents are opened through the `club-document` Edge Function using short-lived signed Storage URLs.

## Deployment

Target production flow once GitHub/Codex write access is connected:

`GitHub -> Vercel -> Supabase`


## Verification and publication safety

Material football-data changes invalidate DJM verification, move the player back to review, and automatically unpublish any live club dossier. A club profile cannot be published until the master player record is verified. A visible market value also requires a source URL.

## Travel readiness

Private player documents may carry a type, country and expiry date. Passport/visa expiry is surfaced in the Admin priority model so DJM can act before a transfer or trial is blocked by travel documentation. Passport numbers are deliberately not collected.
