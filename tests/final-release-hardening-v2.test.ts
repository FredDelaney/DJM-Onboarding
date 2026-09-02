import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('privacy consent is explicit, versioned, timestamped and audited', () => {
  const join = read('app/join/[token]/page.tsx');
  const accept = read('supabase/functions/accept-player-invite/index.ts');

  assert.match(join, /privacy_acknowledged:\s*privacyAccepted/);
  assert.match(accept, /privacy_acknowledged !== true/);
  assert.match(accept, /privacy_notice_acknowledged_at/);
  assert.match(accept, /privacy_notice_acknowledged/);
  assert.match(accept, /audit_events/);
});

test('club share documents keep sensitive document types private', () => {
  const source = read('supabase/functions/club-document/index.ts');

  assert.match(source, /SENSITIVE_TYPES/);
  assert.match(source, /"passport"/);
  assert.match(source, /"medical"/);
  assert.match(source, /document_type/);
  assert.match(source, /Sensitive documents cannot be shared with clubs/);
  assert.match(source, /!doc\.object_path/);
});

test('player deletion preserves staff safeguards while cleaning storage completely', () => {
  const source = read('supabase/functions/remove-player/index.ts');

  assert.match(source, /player\.user_id === caller\.id/);
  assert.match(source, /linkedProfile\?\.role === "admin"/);
  assert.match(source, /linkedProfile\?\.role === "scout"/);
  assert.match(source, /teamMember\?\.is_active/);
  assert.match(source, /collectFolder/);
  assert.match(source, /publicProfile\?\.hero_image_path/);
  assert.doesNotMatch(source, /confirmation !== "REMOVE"/);

  const authDelete = source.indexOf('admin.auth.admin.deleteUser');
  const playerDelete = source.indexOf('.from("players")\n      .delete()');
  assert.ok(authDelete > -1);
  assert.ok(playerDelete > -1);
  assert.ok(authDelete < playerDelete);
});

test('passkey readiness uses secure WebAuthn and accepts current Supabase settings fields', () => {
  const source = read('lib/auth-capabilities.ts');

  assert.match(source, /window\.isSecureContext/);
  assert.match(source, /PublicKeyCredential/);
  assert.match(source, /passkey_enabled/);
  assert.match(source, /passkeys_enabled/);
  assert.doesNotMatch(source, /getClaims/);
});

test('passkey UX is easy to recover from and production RP settings are source controlled', () => {
  const signIn = read('app/sign-in/page.tsx');
  const panel = read('components/ConnectionsPanel.tsx');
  const config = read('supabase/config.toml');

  assert.match(signIn, /Use Face ID or passkey/);
  assert.match(signIn, /Use your password below/);
  assert.match(panel, /Set up quick sign-in/);
  assert.match(panel, /Recover access through your confirmed DJM email\./);
  assert.match(panel, /Your password always works/);
  assert.match(config, /\[auth\.passkey\]/);
  assert.match(config, /enabled = true/);
  assert.match(config, /rp_id = "djmsports\.com"/);
  assert.match(config, /https:\/\/app\.djmsports\.com/);
});


test('club-share metadata privacy fix is reproducible from source control', () => {
  const migration = read('supabase/migrations/20260902205150_hide_sensitive_club_share_document_metadata_v1.sql');

  assert.match(migration, /d\.club_shareable = true/);
  assert.match(migration, /not in \(/);
  assert.match(migration, /'passport'/);
  assert.match(migration, /'medical'/);
  assert.match(migration, /'agreement'/);
});

test('application email deep links default to the stable DJM production domain', () => {
  const source = read('supabase/functions/dispatch-djm-email/index.ts');

  assert.match(source, /https:\/\/app\.djmsports\.com/);
  assert.doesNotMatch(source, /djm-player\.vercel\.app/);
});
