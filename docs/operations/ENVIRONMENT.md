# Environment

Required public client configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server/Edge integrations use provider secrets in Vercel/Supabase environments; never prefix secrets with `NEXT_PUBLIC_`. Optional frontier integrations require explicit feature flags and credentials for Microsoft Graph, model providers, official WhatsApp Business and licensed football/video providers.

The scheduled basic player refresh reuses the private `djm_push_cron_secret` already stored in Supabase Vault. It does not require a browser secret, a Vercel service-role key or a paid Vercel Cron plan. The `weekly-player-refresh` Edge Function must be deployed before its additive schedule migration is applied.

Use Node.js 22 or later; Supabase client libraries dropped Node 20 support in June 2026. New public-schema tables may require explicit Data API grants in addition to RLS under current Supabase settings.
