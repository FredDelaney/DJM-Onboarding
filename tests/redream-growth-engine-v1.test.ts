import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panel = fs.readFileSync('app/platform/DemoRequestsPanel.tsx', 'utf8');
const css = fs.readFileSync('app/platform/DemoRequestsPanel.module.css', 'utf8');
const migration = fs.readFileSync(
  'supabase/migrations/20260924172000_redream_growth_engine_v1.sql',
  'utf8',
);

test('growth engine scores the current V6.1 sales story rather than retired homepage signals', () => {
  for (const signal of ['how-it-works', 'simple_story', "section_key = 'value'", "section_key = 'control'", "section_key = 'pricing'"]) {
    assert.match(migration, new RegExp(signal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(migration, /story_interactions/);
  assert.match(migration, /story_steps/);
  assert.doesNotMatch(migration, /then 'Viewed Agency Autopilot'/);
  assert.doesNotMatch(migration, /case when coalesce\(stats\.scenario_runs/);
});

test('lead score stays explainable and is never described as a close probability', () => {
  assert.match(migration, /intent_score/);
  assert.match(migration, /fit_score/);
  assert.match(panel, /measured from real lead and customer timestamps/i);
  assert.doesNotMatch(panel + migration, /win probability|close probability|chance to close/i);
});

test('marketing funnel connects website behaviour to trial customer and revenue outcomes', () => {
  for (const label of ['Visits', 'Saw example', 'Used example', 'Saw pricing', 'Opened demo', 'Sent request', 'Contacted', 'Demo', 'Qualified', 'Trial', 'Customer']) {
    assert.match(migration, new RegExp(label));
  }
  assert.match(migration, /tenant_customer_lifecycle/);
  assert.match(migration, /contracted_monthly_cents/);
  assert.match(migration, /new_mrr_by_currency/);
  assert.match(migration, /mrr_by_currency/);
  assert.doesNotMatch(panel, /new_mrr_cents/);
});

test('source attribution shows real commercial outcomes without mixing currencies', () => {
  assert.match(panel, /SOURCE TO REVENUE/);
  for (const term of ['Visits', 'Requests', 'Qualified', 'Trials', 'Customers', 'New MRR']) {
    assert.match(panel, new RegExp(term));
  }
  assert.match(panel, /revenueLabel/);
  assert.match(migration, /group by 1/);
  assert.match(migration, /contract_currency/);
});

test('every lead receives a practical deterministic sales brief', () => {
  for (const field of ['headline', 'what_to_show', 'questions', 'proof_to_use', 'recommended_action', 'why']) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
  assert.match(panel, /SALES BRIEF/);
  assert.match(panel, /DO THIS NEXT/);
  assert.match(panel, /SHOW THEM/);
  assert.match(panel, /ASK THEM/);
  assert.match(panel, /PROOF TO USE/);
  assert.match(migration, /Use DJM Sports Management as the real operating example/);
  assert.match(migration, /Ask them to bring one real club request, player situation or live deal/i);
});

test('sales changes create append-only history and preserve the existing audit trail', () => {
  assert.match(migration, /create table if not exists platform\.demo_sales_events/);
  assert.match(migration, /insert into platform\.demo_sales_events/);
  assert.match(migration, /insert into platform\.audit_events/);
  assert.match(panel, /SALES HISTORY/);
  assert.match(panel, /sales_history/);
});

test('growth records are operator-only and do not expose a public table API', () => {
  assert.match(migration, /alter table platform\.demo_sales_events enable row level security/);
  assert.match(migration, /revoke all on table platform\.demo_sales_events from public, anon, authenticated/);
  assert.match(migration, /grant select, insert on table platform\.demo_sales_events to service_role/);
  assert.match(migration, /revoke all on function public\.platform_server_operator_demo_requests/);
  assert.match(migration, /revoke all on function public\.platform_server_operator_funnel_summary/);
});

test('admin stays action-first and usable on mobile', () => {
  assert.match(panel, /Growth command centre/);
  assert.match(panel, /NEEDS YOU TODAY/);
  assert.match(panel, /Biggest measured drop/);
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /briefGrid/);
  assert.match(css, /attributionTable/);
});
