# DJM Player production checklist

Run this after any material change to authentication, onboarding, player data, sharing, documents or notifications.

## Player journey

- Admin creates a player invitation.
- Invitation opens only while valid and not revoked/expired.
- Player account creation links to the intended invited player record.
- Player cannot create an account without a valid DJM invitation.
- Onboarding saves each step.
- Invalid future DOB, invalid URLs, impossible height and malformed phone input are blocked with a useful message.
- Player Home loads after onboarding.
- Player can update their profile without changing agency-only fields.
- A material change to verified football data returns the record to review.

## Weekly check-in

- One-tap “Everything’s good” succeeds.
- Detailed check-in succeeds.
- Negative match numbers are rejected in the UI and database.
- Existing weekly check-in updates rather than creating a duplicate.
- Important fitness/availability signals reach DJM attention.

## DJM Admin

- Admin can invite players.
- Scout access remains limited.
- Player private information is not exposed to unauthorised staff.
- Admin can request information from a player.
- Admin can verify/unverify the current player record.
- Admin can upload a player photo and private documents.
- Admin can add opportunities, notes, career entries and videos.

## Club dossier

- Unverified records cannot be published.
- Material football-data changes unpublish the live dossier.
- Public dossier contains no salary, passport, injury, contact or private notes.
- Tracked share links respect expiry and active status.
- Club-shareable documents open only through signed links.
- Share view count increments correctly.

## Deployment

- `npm run typecheck`
- `npm run build`
- Vercel production deployment is READY.
- Vercel runtime errors checked after deployment.
- Supabase security adviser checked after any DDL/RLS/function/storage change.
