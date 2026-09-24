import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panel = fs.readFileSync('app/platform/DemoRequestsPanel.tsx', 'utf8');
const page = fs.readFileSync('app/platform/page.tsx', 'utf8');
const ops = fs.readFileSync('supabase/functions/platform-ops/index.ts', 'utf8');
const migration = fs.readFileSync(
  'supabase/migrations/20260923213000_redream_revenue_command_centre_v1.sql',
  'utf8',
);

test('revenue command centre has one prospect workbench and an explicit action queue', () => {
  assert.match(panel, /Growth command centre/);
  assert.match(panel, /NEEDS YOU TODAY/);
  assert.match(panel, /PROSPECT WORKBENCH/);
  assert.match(panel, /Save sales context/);
  assert.match(panel, /WEBSITE JOURNEY/);
  assert.match(panel, /Customer lifecycle owns this stage/);
});

test('sales pipeline is descriptive and keeps trial and customer stages lifecycle-derived', () => {
  assert.match(panel, /'new'/);
  assert.match(panel, /'contacted'/);
  assert.match(panel, /'demo'/);
  assert.match(panel, /'qualified'/);
  assert.match(panel, /'trial'/);
  assert.match(panel, /'customer'/);
  assert.match(panel, /customerStages\[item\.converted_tenant_id\] === 'trial'/);
  assert.match(panel, /Customer lifecycle owns this stage/);
});

test('operator can record next action follow-up demo timing and notes without provisioning', () => {
  assert.match(migration, /next_action text/);
  assert.match(migration, /next_follow_up_at timestamptz/);
  assert.match(migration, /demo_scheduled_at timestamptz/);
  assert.match(migration, /operator_notes text/);
  assert.match(migration, /demo_request\.sales_updated/);
  assert.match(migration, /It never provisions a tenant/);
  assert.doesNotMatch(
    migration,
    /platform_server_provision_customer/,
  );
});

test('revenue mutations stay behind the platform operator service bridge', () => {
  assert.match(ops, /action==="demo_request_sales_update"/);
  assert.match(ops, /platform_server_operator_update_demo_request_sales/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.platform_server_operator_update_demo_request_sales[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.platform_server_operator_update_demo_request_sales[\s\S]*to service_role/,
  );
});

test('lead to agency handoff retains the sales origin and still requires explicit creation', () => {
  assert.doesNotMatch(page, /prospect_context:/);
  assert.match(page, /demo_request_id/);
  assert.match(page, /sourceRequest/);
  assert.match(page, /onCreateAgency=\{startAgencyFromDemo\}/);
  assert.match(page, /action: 'create_customer'/);
  assert.match(page, /status: 'converted'/);
  assert.doesNotMatch(panel, /auto.?provision/i);
});

test('website journey remains bounded and uses only the existing first-party event fields', () => {
  assert.match(migration, /limit 32/);
  assert.match(migration, /event_name/);
  assert.match(migration, /section_key/);
  assert.match(migration, /scenario_kind/);
  assert.match(migration, /cta_key/);
  assert.match(migration, /metadata->>'mode'/);
});


const attentionFix = fs.readFileSync(
  'supabase/migrations/20260923214500_redream_revenue_attention_due_fix_v1.sql',
  'utf8',
);

test('prospect attention uses the earliest explicit due time and displays that same deadline', () => {
  assert.match(attentionFix, /least\(d\.next_follow_up_at, d\.demo_scheduled_at\)/);
  assert.match(panel, /item\.attention_due_at/);
  assert.match(panel, /item\.attention_reason/);
});

test('lead conversion keeps one canonical prospect record instead of copying raw sales context into tenant metadata', () => {
  assert.match(page, /demo_request_id: sourceRequest\?\.id \|\| null/);
  assert.doesNotMatch(page, /prospect_context:/);
  assert.doesNotMatch(page, /throw demoError/);
});
