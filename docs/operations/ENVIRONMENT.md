# Environment

Required public client configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server/Edge integrations use provider secrets in Vercel/Supabase environments; never prefix secrets with `NEXT_PUBLIC_`. Optional frontier integrations require explicit feature flags and credentials for Microsoft Graph, model providers, official WhatsApp Business and licensed football/video providers.

Use Node.js 22 or later; Supabase client libraries dropped Node 20 support in June 2026. New public-schema tables may require explicit Data API grants in addition to RLS under current Supabase settings.
