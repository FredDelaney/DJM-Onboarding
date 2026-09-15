import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('join requires the current privacy notice before account activation', () => {
  const join = readFileSync('app/join/[token]/page.tsx', 'utf8');
  const accept = readFileSync('supabase/functions/accept-player-invite/index.ts', 'utf8');

  assert.doesNotMatch(join, /const PRIVACY_NOTICE_VERSION/);
  assert.match(join, /privacyAccepted/);
  assert.match(join, /privacyNoticeUrl/);
  assert.match(join, /privacyNoticeVersion/);
  assert.match(join, /invite\?\.can_activate/);
  assert.match(join, /privacy_notice_version:/);
  assert.match(
    join,
    /disabled=\{busy \|\| !privacyAccepted \|\| !privacyReady\}/,
  );

  assert.doesNotMatch(accept, /const PRIVACY_NOTICE_VERSION/);
  assert.match(accept, /platform_server_public_invite_preflight/);
  assert.match(accept, /expectedNoticeVersion/);
  assert.match(accept, /privacy_notice_acknowledged_at/);
  assert.match(accept, /privacy_notice_version:/);
});

test('privacy notice explains the core DJM Player data boundaries', () => {
  const privacy = readFileSync('app/privacy/page.tsx', 'utf8');

  assert.match(privacy, /DJM Sports Management/);
  assert.match(privacy, /Purposes and lawful bases/);
  assert.match(privacy, /Public dossiers and private club-share links/);
  assert.match(privacy, /No automated career decisions/);
  assert.match(privacy, /YOUR RIGHTS/);
  assert.match(privacy, /jesse\.edge@djmsports\.com/);
});

test('club documents stop when the dossier is withdrawn or unverified', () => {
  const source = readFileSync('supabase/functions/club-document/index.ts', 'utf8');

  assert.match(source, /player_public_profiles/);
  assert.match(source, /verification_status !== "verified"/);
  assert.match(source, /!player\.verified_at/);
  assert.match(source, /!profile\?\.published/);
  assert.match(source, /Share link unavailable/);
});

test('complete player removal commits the player row before irreversible auth cleanup', () => {
  const source = readFileSync('supabase/functions/remove-player/index.ts', 'utf8');

  assert.match(source, /collectFolder/);
  assert.match(source, /player-private/);
  assert.match(source, /admin\/\$\{playerId\}/);
  assert.match(source, /Could not remove \$\{bucket\} files/);

  const authDelete = source.indexOf('admin.auth.admin.deleteUser');
  const playerDelete = source.indexOf('.from("players")\n      .delete()');

  assert.ok(authDelete > -1);
  assert.ok(playerDelete > -1);
  assert.ok(playerDelete < authDelete);
  assert.match(source, /storage_objects_removed/);
});
