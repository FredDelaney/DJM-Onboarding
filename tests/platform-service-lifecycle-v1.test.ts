import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260918103000_add_guarded_customer_service_lifecycle_v1.sql',
  'utf8',
);
const ops = readFileSync('supabase/functions/platform-ops/index.ts', 'utf8');
const page = readFileSync('app/platform/page.tsx', 'utf8');
const css = readFileSync('app/platform/platform.module.css', 'utf8');
const runtime = readFileSync(
  'supabase/functions/platform-tenant-runtime/index.ts',
  'utf8',
);

test('service lifecycle has one dedicated audited operator mutation', () => {
  assert.match(
    migration,
    /platform_server_operator_set_customer_service_state/,
  );
  assert.match(migration, /platform_operator_access_required/);
  assert.match(migration, /for update/);
  assert.match(
    migration,
    /platform\.customer\.service_state_changed/,
  );
  assert.match(
    migration,
    /grant execute on function public\.platform_server_operator_set_customer_service_state[\s\S]*to service_role/,
  );
});

test('pause is reversible and never ends the active plan', () => {
  const pausedStart = migration.indexOf(
    "elsif v_target_state='paused' then",
  );
  const liveStart = migration.indexOf(
    "elsif v_target_state='live' then",
    pausedStart,
  );
  const paused = migration.slice(pausedStart, liveStart);

  assert.match(paused, /set status='suspended'/);
  assert.match(paused, /set status='on_hold'/);
  assert.match(paused, /status='active'/);
  assert.doesNotMatch(paused, /tenant_plan_assignments/);
  assert.doesNotMatch(paused, /delete from/i);
});

test('resume restores only ReDream on-hold billing and preserves past-due truth', () => {
  const liveStart = migration.indexOf(
    "elsif v_target_state='live' then",
  );
  const churnStart = migration.indexOf(
    "elsif v_target_state='churned' then",
    liveStart,
  );
  const live = migration.slice(liveStart, churnStart);

  assert.match(live, /set status='active'/);
  assert.match(live, /where tenant_id=p_tenant_id and status='on_hold'/);
  assert.doesNotMatch(live, /past_due/);
  assert.doesNotMatch(live, /tenant_plan_assignments/);
});

test('churn requires a reason and synchronises access billing and plan truth', () => {
  assert.match(
    migration,
    /v_target_state in \('paused','churned'\) and v_reason is null/,
  );
  assert.match(migration, /customer_service_state_reason_required/);

  const churnStart = migration.indexOf(
    "elsif v_target_state='churned' then",
  );
  const churn = migration.slice(churnStart);

  assert.match(churn, /stage='churned'/);
  assert.match(churn, /cancellation_reason=v_reason/);
  assert.match(churn, /set status='closed'/);
  assert.match(churn, /set status='cancelled'/);
  assert.match(churn, /platform\.tenant_plan_assignments/);
  assert.match(churn, /set status='ended'/);
  assert.doesNotMatch(churn, /delete from/i);
});

test('operator detail exposes canonical billing status without a second client read', () => {
  assert.match(migration, /'billing_account'/);
  assert.match(migration, /from platform\.billing_accounts ba/);
  assert.match(page, /billing_account\?: Record<string, any> \| null/);
  assert.match(page, /detail\.billing_account\?\.status/);
});

test('edge bridge exposes only the dedicated service-state action', () => {
  assert.match(ops, /action==="set_customer_service_state"/);
  assert.match(
    ops,
    /platform_server_operator_set_customer_service_state/,
  );
  assert.match(ops, /transition_not_allowed/);
  assert.match(ops, /reason_required/);
});

test('cockpit requires explicit confirmation and reason for pause or churn', () => {
  assert.match(page, /serviceStateTarget/);
  assert.match(page, /serviceStateNeedsReason/);
  assert.match(page, /Pause reason/);
  assert.match(page, /Cancellation reason/);
  assert.match(page, /Confirm state change/);
  assert.match(page, /Customer data is retained/);
  assert.match(css, /\.serviceStateConfirm[\s\S]*\.serviceTerminal\s*\{/);
  assert.match(css, /\.dangerButton\s*\{/);
});

test('suspended and closed tenants stay unresolved at runtime', () => {
  assert.match(runtime, /data\.status !== "active"/);
  assert.match(runtime, /resolved: false/);
});
