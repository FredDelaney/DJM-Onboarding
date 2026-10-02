import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const agencyOs = readFileSync('supabase/functions/agency-os/index.ts','utf8');
const migration = readFileSync('supabase/migrations/20261002105500_player_profile_publish_snapshot_writer_v1.sql','utf8');

test('Player Profile publish uses the protected tenant-native snapshot writer', () => {
  assert.match(agencyOs, /platform_server_publish_player_profile_snapshot/);
  assert.doesNotMatch(agencyOs, /from\("player_public_profiles"\)\.upsert\(payload\)/);
  assert.match(migration, /djm\.internal_tenant_dossier_mode','publish_snapshot'/);
  assert.match(migration, /m\.role in \('owner','admin'\)/);
  assert.match(migration, /verification_status<>'verified'/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
});

test('publish snapshot refreshes canonical football data and club-facing evidence', () => {
  assert.match(migration, /primary_position=excluded\.primary_position/);
  assert.match(migration, /current_club=excluded\.current_club/);
  assert.match(migration, /key_stats=excluded\.key_stats/);
  assert.match(migration, /career_timeline=excluded\.career_timeline/);
  assert.match(migration, /selected_videos=excluded\.selected_videos/);
  assert.match(migration, /verified_at=excluded\.verified_at/);
});

test('unpublish also uses the protected server boundary', () => {
  assert.match(agencyOs, /platform_server_unpublish_external_dossier/);
  assert.doesNotMatch(agencyOs, /update\(\{published:false\}\)/);
});
