import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('operator attention is derived from explicit time and evidence signals', () => {
  const migration = read(
    'supabase/migrations/20260915122006_add_time_aware_operator_attention_v1.sql',
  );

  assert.match(migration, /platform_server_customer_attention/);
  assert.match(migration, /follow_up_at is not null and v_follow_up_at<=v_now/);
  assert.match(migration, /trial ends within 24 hours/i);
  assert.match(migration, /opened the secure invitation more than 12 hours ago/i);
  assert.match(migration, /waiting unopened for more than 48 hours/i);
  assert.match(migration, /No new activation milestone has been observed for at least 72 hours/);
});

test('scheduled follow-up suppresses premature operator action', () => {
  const migration = read(
    'supabase/migrations/20260915122006_add_time_aware_operator_attention_v1.sql',
  );

  assert.match(migration, /A deliberate follow-up is already scheduled/);
  assert.match(migration, /'requires_action',false/);
  assert.match(migration, /'state',case when v_follow_up_at<=v_now\+interval '24 hours' then 'scheduled_today' else 'scheduled' end/);
});

test('operator agenda is ranked by due evidence rather than customer health score', () => {
  const migration = read(
    'supabase/migrations/20260915122006_add_time_aware_operator_attention_v1.sql',
  );

  const agendaStart = migration.indexOf("'agenda'");
  const customersStart = migration.indexOf("'customers'", agendaStart);
  const agendaSql = migration.slice(agendaStart, customersStart);

  assert.match(agendaSql, /where stage<>'internal' and requires_action/);
  assert.match(agendaSql, /order by attention_rank,attention_due_at nulls last/);
  assert.doesNotMatch(agendaSql, /health_score/);
});

test('ReDream cockpit surfaces time-aware attention and due-now metrics', () => {
  const page = read('app/platform/page.tsx');

  assert.match(page, /type CustomerAttention/);
  assert.match(page, /customer\.attention\?\.requires_action/);
  assert.match(page, /label="Due now"/);
  assert.match(page, /customer\.attention\?\.why_now/);
  assert.match(page, /attentionBadge/);
});
