# ReDream

ReDream is a multi-tenant operating system for football agencies. It connects agency intelligence, player service, relationships, recruitment, club demand and deal workflows. DJM Sports Management is one agency tenant; Northstar is a synthetic staging tenant.

The canonical AI capability is ReDream AI, presented as Capture inside each agency workspace. Legacy DJM database, storage and URL identifiers remain compatibility contracts, not the platform identity.

## Local development

Use Node.js 24 and npm.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Set the two public Supabase values in `.env.local`. Local and preview builds intentionally have no production fallback, so a missing environment configuration fails visibly instead of silently writing to production.

## Verification

```bash
npm run check
```

The command regenerates Next.js route types, runs the test suite, performs strict TypeScript checking and creates a production build.

## Production architecture

- Next.js App Router on Vercel
- Supabase Auth, Postgres, Storage, RLS, Cron and Edge Functions
- GitHub Actions on Node.js 24
- Vercel Git integration deploys `main`

The Supabase migrations directory is the production migration ledger. Edge Function sources under `supabase/functions` must be updated in the same commit as every deployment.

## Security boundaries

- Player-private, agency-internal and club-shareable information are separate visibility states.
- Public dossiers require a published profile and current verification.
- Admin/scout profiles are synchronized into operational team membership by a private trigger.
- Anonymous table grants are limited to intentional public reads.
- Capability-token functions validate expiry and scope before returning data.
- Service-role keys are read only from server-side Edge Function environment variables.

Never commit `.env*`, service-role keys, scheduler secrets, invitation tokens or share tokens.
