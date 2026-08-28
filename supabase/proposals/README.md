# Database proposals

Files in this directory are design proposals, not deployable migrations.

`djm_intelligence_foundation.sql` defines future player-goal, service-ledger, strategy and decision-room storage. No current application route reads or writes those objects. Move it into `supabase/migrations` only when the product flow, RLS integration tests and rollback plan are ready together.
