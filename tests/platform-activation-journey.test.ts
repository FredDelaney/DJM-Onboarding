import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('agency activation is measured from operating value rather than form completion', () => {
  const migration = read(
    'supabase/migrations/20260915083727_add_agency_activation_journey_v1.sql',
  );

  assert.match(migration, /platform_server_customer_activation/);
  assert.match(migration, /roster_player_count/);
  assert.match(migration, /relationship_count/);
  assert.match(migration, /active_club_need_count/);
  assert.match(migration, /completed_action_count/);
  assert.match(migration, /first_value_ready/);
  assert.match(migration, /next_activation_step/);
});

test('owner invitation engagement is tracked without storing readable invite tokens', () => {
  const migration = read(
    'supabase/migrations/20260915083727_add_agency_activation_journey_v1.sql',
  );
  const inviteEdge = read(
    'supabase/functions/agency-owner-invite-public/index.ts',
  );

  assert.match(migration, /first_opened_at timestamptz/);
  assert.match(migration, /open_count integer not null default 0/);
  assert.match(migration, /first_sent_at timestamptz/);
  assert.match(migration, /platform_server_public_owner_invite_open/);
  assert.match(
    migration,
    /revoke all on function public\.platform_server_public_owner_invite_open[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    inviteEdge,
    /action === "preflight"[\s\S]*platform_server_public_owner_invite_open/,
  );
});

test('operator API can mark an owner invitation as sent without exposing the private table', () => {
  const migration = read(
    'supabase/migrations/20260915083727_add_agency_activation_journey_v1.sql',
  );
  const platformOps = read('supabase/functions/platform-ops/index.ts');

  assert.match(migration, /platform_server_operator_mark_owner_invite_sent/);
  assert.match(
    migration,
    /revoke all on function public\.platform_server_operator_mark_owner_invite_sent[\s\S]*from public, anon, authenticated/,
  );
  assert.match(platformOps, /action==="mark_owner_invite_sent"/);
});
