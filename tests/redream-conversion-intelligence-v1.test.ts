import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tracker = fs.readFileSync('lib/redream-funnel.ts', 'utf8');
const trackerView = fs.readFileSync('components/ReDreamFunnelTracker.tsx', 'utf8');
const landing = fs.readFileSync('components/ReDreamPublicLanding.tsx', 'utf8');
const live = fs.readFileSync('components/ReDreamLiveOperatingDemo.tsx', 'utf8');
const decision = fs.readFileSync('components/ReDreamDecisionLayer.tsx', 'utf8');
const demo = fs.readFileSync('components/ReDreamDemoRequestButton.tsx', 'utf8');
const operator = fs.readFileSync('app/platform/DemoRequestsPanel.tsx', 'utf8');
const platformPage = fs.readFileSync('app/platform/page.tsx', 'utf8');
const platformOps = fs.readFileSync('supabase/functions/platform-ops/index.ts', 'utf8');
const eventEdge = fs.readFileSync('supabase/functions/redream-funnel-event/index.ts', 'utf8');
const demoEdge = fs.readFileSync('supabase/functions/redream-demo-request/index.ts', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260923194500_redream_conversion_intelligence_v1.sql', 'utf8');

test('conversion analytics are first party ephemeral and do not persist a browser identifier', () => {
  assert.match(tracker, /redream-funnel-event/);
  assert.match(tracker, /runtimeContext/);
  assert.doesNotMatch(tracker, /localStorage/);
  assert.doesNotMatch(tracker, /sessionStorage/);
  assert.doesNotMatch(tracker, /document\.cookie/);
  assert.match(trackerView, /IntersectionObserver/);
  assert.match(trackerView, /page_view/);
  assert.match(trackerView, /section_view/);
});

test('live product tracking records scenario behaviour without sending raw agency situation text', () => {
  assert.match(live, /scenario_select/);
  assert.match(live, /scenario_run/);
  assert.match(live, /scenario_complete/);
  assert.match(decision, /product_mode/);
  assert.doesNotMatch(tracker, /\bnote\b/);
  assert.doesNotMatch(eventEdge, /priority/);
  assert.match(migration, /No raw scenario text is stored here/);
});

test('public funnel event ingestion is intentionally public but writes only through service bridge', () => {
  assert.match(config, /\[functions\.redream-funnel-event\][\s\S]*verify_jwt = false/);
  assert.match(eventEdge, /allowedHost/);
  assert.match(eventEdge, /platform_server_create_funnel_event/);
  assert.match(migration, /create table if not exists platform\.public_funnel_events/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table platform\.public_funnel_events from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.platform_server_create_funnel_event\(jsonb\)[\s\S]*to service_role/);
});

test('demo conversion links anonymous acquisition only after deliberate submission', () => {
  assert.match(demo, /getFunnelContext/);
  assert.match(demo, /conversion_source/);
  assert.match(demo, /demo_submit/);
  assert.match(demoEdge, /session_id/);
  assert.match(demoEdge, /utm_source/);
  assert.match(migration, /add column if not exists session_id uuid/);
  assert.match(migration, /conversion_source/);
});

test('operator gets transparent funnel metrics and deterministic lead intelligence', () => {
  assert.match(migration, /platform_server_operator_funnel_summary/);
  assert.match(migration, /intent_score/);
  assert.match(migration, /fit_score/);
  assert.match(platformOps, /action==="funnel_summary"/);
  assert.match(platformPage, /funnelSummary/);
  assert.match(operator, /Priority is a transparent engagement and fit signal/);
  assert.doesNotMatch(operator, /win probability/i);
});

test('every major public sales action contributes to one connected funnel', () => {
  assert.match(landing, /ReDreamFunnelTracker/);
  assert.match(landing, /data-funnel-cta="hero_decision_layer"/);
  assert.match(landing, /id="decision-layer"/);
  assert.match(landing, /id="operating-loop"/);
  assert.match(landing, /id="commercial-thread"/);
  assert.match(landing, /id="final-cta"/);
  assert.match(live, /scenario_select/);
  assert.match(live, /scenario_run/);
  assert.match(decision, /product_mode/);
  assert.match(demo, /demo_open/);
  assert.match(demo, /demo_step_2/);
});

const publicPrivacyPage = fs.readFileSync('app/privacy/page.tsx', 'utf8');
const publicPrivacyNotice = fs.readFileSync('app/privacy/ReDreamPublicPrivacy.tsx', 'utf8');
const retentionMigration = fs.readFileSync('supabase/migrations/20260923204000_redream_public_funnel_retention_v1.sql', 'utf8');

test('canonical ReDream privacy explains first-party measurement without weakening agency privacy', () => {
  assert.match(publicPrivacyPage, /shouldRenderReDreamPublicSite/);
  assert.match(publicPrivacyPage, /ReDreamPublicPrivacy/);
  assert.match(publicPrivacyNotice, /90 days/);
  assert.match(publicPrivacyNotice, /does not set its own cookie/);
  assert.match(publicPrivacyNotice, /not stored in the anonymous funnel\s+events table/);
  assert.match(publicPrivacyNotice, /Vercel/);
  assert.match(publicPrivacyNotice, /Supabase/);
});

test('anonymous funnel events keep an automatic bounded retention policy', () => {
  assert.match(retentionMigration, /platform_server_cleanup_public_funnel_events/);
  assert.match(retentionMigration, /default 90/);
  assert.match(retentionMigration, /redream-public-funnel-retention-v1/);
  assert.match(retentionMigration, /cron\.schedule/);
  assert.match(retentionMigration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(retentionMigration, /grant execute on function[\s\S]*to service_role/);
});
