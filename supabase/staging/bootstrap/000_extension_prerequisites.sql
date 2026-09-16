-- DJM Player / DJM OS staging extension prerequisites
-- STAGING BOOTSTRAP ONLY. Do not run against production.
--
-- Apply before 001_application_schema.sql.
--
-- Required by:
--   - recovered DJM production functions (pg_trgm, pg_net, pgcrypto, pg_cron, vault)
--   - staging white-label platform_server_* RPCs (pgmq)
--
-- Intentionally NOT enabling pg_graphql:
--   - no application dependency was found in the repository or recovered functions
--   - keeping it disabled avoids reproducing current production GraphQL exposure warnings
--
-- No extension versions are pinned. Supabase deprecated extension version pinning in 2026.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create extension if not exists supabase_vault;
create extension if not exists pgmq;

commit;
