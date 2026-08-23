# DJM Player

Private career app and agency operating platform for DJM Sports Management.

DJM Player has three deliberately separate experiences:

1. **Player app** — onboarding, live profile, private career information, 60-second weekly check-ins, documents and DJM Inbox.
2. **DJM Admin** — player records, requests, messages, check-in alerts, verification, opportunities, authority/agreements, CV editing, club shares and team access.
3. **Club dossier** — a deliberately limited, verified recruitment profile that never exposes private player information.

## Stack

- Next.js 15 + React 19
- Supabase Auth, Postgres, RLS, Storage and Edge Functions
- Vercel
- Web Push / PWA support

## Routes

- `/` premium entry
- `/sign-in` returning player / authorised DJM staff access
- `/join/[token]` private player invitation
- `/onboarding` guided player onboarding
- `/home` player home
- `/inbox` DJM requests and player messages
- `/check-in` weekly player check-in
- `/profile` master player + private career information
- `/documents` private files and agreements
- `/cv` player-facing club-profile preview
- `/admin` DJM command centre
- `/admin/players/[id]` complete agency player record
- `/p/[slug]` published club-facing dossier
- `/s/[token]` tracked club share

## Data rules

- Real player data never belongs in this repository.
- Private contact, salary, passport, injury/check-in and internal agency information stays in Supabase under RLS.
- Public club profiles are a separate publishable snapshot.
- DJM verification is invalidated when important player data changes.
- External-source changes are reviewable suggestions, never silent overwrites.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

The browser uses only Supabase publishable credentials. Service-role credentials and VAPID private material are server-side only.

See `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`.


## Product principles

- Player Home answers one question first: what needs me now?
- “Opportunity ready” replaces generic profile-completion language and surfaces only the next useful action.
- Weekly check-ins are designed to take about 60 seconds and now have automatic Monday push reminders.
- Private data and club-facing recruitment data remain separate by design.
- DJM verification is required before publication and is invalidated by material player-data changes.
- Passport numbers are not collected. Travel-document type, country and expiry are enough for readiness alerts.
