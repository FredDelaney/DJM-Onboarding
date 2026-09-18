import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260918111500_add_contract_term_renewal_v1.sql',
  'utf8',
);
const ops = readFileSync('supabase/functions/platform-ops/index.ts', 'utf8');
const page = readFileSync('app/platform/page.tsx', 'utf8');
const css = readFileSync('app/platform/platform.module.css', 'utf8');

test('contract term end is canonical dated commercial evidence', () => {
  assert.match(
    migration,
    /add column if not exists contract_term_ends_on date/,
  );
  assert.match(
    migration,
    /contract_term_ends_on >= contracted_at::date/,
  );
  assert.doesNotMatch(migration, /interval '1 year'/i);
  assert.doesNotMatch(migration, /make_interval\s*\(\s*years/i);
});

test('contract term changes use one audited service-only mutation', () => {
  assert.match(
    migration,
    /platform_server_operator_set_contract_term/,
  );
  assert.match(migration, /platform_operator_access_required/);
  assert.match(migration, /commercial_contract_required/);
  assert.match(migration, /invalid_contract_term_end/);
  assert.match(
    migration,
    /platform\.customer\.contract_term_updated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.platform_server_operator_set_contract_term[\s\S]*to service_role/,
  );
});

test('renewal attention wraps existing attention instead of replacing its priorities', () => {
  assert.match(
    migration,
    /v_base:=public\.platform_server_customer_attention\(p_tenant_id\)/,
  );
  assert.match(
    migration,
    /if v_base_requires_action and v_base_rank<=v_rank then[\s\S]*return v_base/,
  );
  assert.match(migration, /'source','renewal'/);
  assert.match(migration, /Contract renewal overdue/);
  assert.match(migration, /Renewal decision due/);
  assert.match(migration, /Renewal window open/);
});

test('annual contracts missing a term date become actionable without guessing', () => {
  assert.match(
    migration,
    /if v_contract_term_ends_on is null then[\s\S]*if not v_annual_commitment then[\s\S]*return v_base/,
  );
  assert.match(migration, /Record contract end date/);
  assert.match(
    migration,
    /cannot track the renewal window/,
  );
  assert.doesNotMatch(migration, /\+ interval '12 months'/i);
});

test('operator portfolio uses renewal-aware attention in the existing agenda', () => {
  assert.match(
    migration,
    /'attention',public\.platform_server_customer_attention_with_renewal\(t\.id\)/,
  );
  assert.match(
    migration,
    /'renewals_due',count\(\*\) filter\(where requires_action and attention_source='renewal'/,
  );
  assert.match(migration, /'agenda'/);
});

test('platform bridge records terms and routes renewal attention to commercial control', () => {
  assert.match(ops, /action==="set_contract_term"/);
  assert.match(
    ops,
    /platform_server_operator_set_contract_term/,
  );
  assert.match(
    ops,
    /platform_server_customer_attention_with_renewal/,
  );
  assert.match(ops, /label:"Review renewal"/);
  assert.match(ops, /target:"commercial-control"/);
});

test('cockpit contract term changes require explicit review and confirmation', () => {
  assert.match(page, /detailContractTermEnd/);
  assert.match(page, /confirmingContractTerm/);
  assert.match(page, /contractTermChronologyValid/);
  assert.match(page, /Review term/);
  assert.match(page, /Confirm term/);
  assert.match(page, /No end date[\s\S]*guessed automatically/);
  assert.match(page, /renewal timing cannot yet be tracked/);
  assert.match(css, /\.contractTermControl\s*\{/);
  assert.match(css, /\.contractTermConfirm\s*\{/);
});

test('term mutation stays isolated from price plan billing and lifecycle writes', () => {
  const start = migration.indexOf(
    'create or replace function public.platform_server_operator_set_contract_term',
  );
  const end = migration.indexOf(
    'create or replace function public.platform_server_customer_attention_with_renewal',
    start,
  );
  const source = migration.slice(start, end);

  assert.doesNotMatch(source, /tenant_plan_assignments/);
  assert.doesNotMatch(source, /billing_accounts/);
  assert.doesNotMatch(source, /contracted_monthly_cents\s*=/);
  assert.doesNotMatch(source, /annual_commitment\s*=/);
  assert.doesNotMatch(source, /stage\s*=/);
});
