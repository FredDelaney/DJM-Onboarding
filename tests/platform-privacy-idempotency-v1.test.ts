import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('privacy profile updates are idempotent for the same immutable notice version', () => {
  const migration = read(
    'supabase/migrations/20260915110206_harden_privacy_profile_version_idempotency_v1.sql',
  );

  assert.match(migration, /tenant_privacy_notice_versions%rowtype/);
  assert.match(migration, /select \* into v_existing/);
  assert.match(migration, /v_effective_at:=v_existing\.effective_at/);
  assert.match(
    migration,
    /p_effective_at is not null and v_existing\.effective_at is distinct from p_effective_at/,
  );
  assert.match(migration, /privacy_notice_version_conflict/);
});

test('ReDream explains that changed legal details require a new notice version', () => {
  const card = read('app/platform/AgencyGoLiveCard.tsx');

  assert.match(card, /privacy_notice_version_conflict/);
  assert.match(card, /Use a new notice version for legal changes/);
  assert.match(card, /setPrivacyOpen\(false\)/);
});
