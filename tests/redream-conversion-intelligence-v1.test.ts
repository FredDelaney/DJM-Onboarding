import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tracker = fs.readFileSync('lib/redream-funnel.ts', 'utf8');
const trackerView = fs.readFileSync('components/ReDreamFunnelTracker.tsx', 'utf8');
const landing = fs.readFileSync('components/ReDreamPublicLanding.tsx', 'utf8');
const experience = fs.readFileSync('components/ReDreamInteractiveExperience.tsx', 'utf8');
const product = fs.readFileSync('components/ReDreamProductStory.tsx', 'utf8');
const demo = fs.readFileSync('components/ReDreamDemoRequestButton.tsx', 'utf8');
const operator = fs.readFileSync('app/platform/DemoRequestsPanel.tsx', 'utf8');
const platformPage = fs.readFileSync('app/platform/page.tsx', 'utf8');
const platformOps = fs.readFileSync('supabase/functions/platform-ops/index.ts', 'utf8');
const eventEdge = fs.readFileSync('supabase/functions/redream-funnel-event/index.ts', 'utf8');
const demoEdge = fs.readFileSync('supabase/functions/redream-demo-request/index.ts', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');
const migration = fs.readFileSync(
  'supabase/migrations/20260923194500_redream_conversion_intelligence_v1.sql',
  'utf8',
);

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

test('interactive tracking records behaviour without sending raw agency situation text', () => {
  assert.match(experience, /scenario_select/);
  assert.match(experience, /scenario_run/);
  assert.match(experience, /scenario_complete/);
  assert.match(product, /product_mode/);
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

test('demo conversion links the anonymous session and acquisition only after deliberate submission', () => {
  assert.match(demo, /getFunnelContext/);
  assert.match(demo, /conversion_source/);
  assert.match(demo, /demo_submit/);
  assert.match(demoEdge, /session_id/);
  assert.match(demoEdge, /utm_source/);
  assert.match(migration, /add column if not exists session_id uuid/);
  assert.match(migration, /conversion_source/);
});

test('optional team and roster fields are truly optional across UI and backend', () => {
  assert.match(demo, /<option value="">Optional<\/option>/);
  assert.match(demoEdge, /if \(staffSize && !staffBands\.has\(staffSize\)\)/);
  assert.match(demoEdge, /if \(playerCount && !playerBands\.has\(playerCount\)\)/);
  assert.match(migration, /alter column staff_size drop not null/);
  assert.match(migration, /alter column player_count drop not null/);
});

test('operator gets transparent funnel metrics and deterministic lead intelligence', () => {
  assert.match(migration, /platform_server_operator_funnel_summary/);
  assert.match(migration, /intent_score/);
  assert.match(migration, /fit_score/);
  assert.match(migration, /Ran the interactive agency scenario/);
  assert.match(platformOps, /action==="funnel_summary"/);
  assert.match(platformPage, /funnelSummary/);
  assert.match(operator, /Priority is a transparent engagement and fit signal/);
  assert.match(operator, /Intent \{intel\.intent_score \|\| 0\}\/60/);
  assert.doesNotMatch(operator, /win probability/i);
});

test('every major public sales action contributes to one connected funnel', () => {
  assert.match(landing, /ReDreamFunnelTracker/);
  assert.match(landing, /data-funnel-cta="hero_try"/);
  assert.match(landing, /id="operating-spine"/);
  assert.match(landing, /id="final-cta"/);
  assert.match(demo, /demo_open/);
  assert.match(demo, /demo_step_2/);
  assert.match(experience, /trackingKey="interactive_result"/);
});
