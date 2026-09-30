import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260930164500_harden_email_outbox_tenant_resolver_v2.sql',
  'utf8',
);

test('meeting reminder tenant resolver is hardened by a forward migration', () => {
  assert.match(
    migration,
    /revoke all on function private\.email_outbox_tenant_id\(uuid, jsonb\)/,
  );
  assert.match(migration, /public, anon, authenticated/);
  assert.match(
    migration,
    /grant execute on function private\.email_outbox_tenant_id\(uuid, jsonb\)/,
  );
  assert.match(migration, /postgres, service_role/);
  assert.doesNotMatch(
    migration,
    /grant execute[\s\S]*authenticated/,
  );
});
