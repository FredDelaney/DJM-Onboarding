import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const manager = read('components/AgencyPlayerProfile.tsx');
const players = read('components/AgencyPlayersWorkspace.tsx');
const shell = read('components/AgencyOperatingWorkspace.tsx');
const publicProfile = read('components/PublicProfile.tsx');
const pdf = read('components/ClubCvPdf.tsx');
const playerPage = read('app/p/[slug]/page.tsx');
const playerCv = read('app/cv/page.tsx');
const agencyOs = read('supabase/functions/agency-os/index.ts');
const shareEdge = read('supabase/functions/club-share-public/index.ts');
const publicEdge = read('supabase/functions/player-profile-public/index.ts');

const migrationName = readdirSync('supabase/migrations').find((name) =>
  name.endsWith('_redream_player_profile_v2.sql'),
);
assert.ok(migrationName, 'Phase 4 migration file is missing');
const migration = read(`supabase/migrations/${migrationName}`);

test('Player Profile is part of the current Players workspace', () => {
  assert.match(shell, /AgencyPlayerProfile/);
  assert.match(shell, /selectedPlayerId/);
  assert.match(players, /view=players&player=/);
  assert.match(players, />\s*Player Profile\s*</);
});

test('Player Profile manager uses simple human states instead of scores', () => {
  assert.match(manager, /Ready to publish/);
  assert.match(manager, /missingCount/);
  assert.match(manager, /to finish/);
  assert.match(manager, /missingCount === 1 \? 'thing' : 'things'/);
  assert.doesNotMatch(manager, /Profile readiness/);
  assert.doesNotMatch(manager, /readiness\}%/);
  assert.doesNotMatch(manager, /ReDream/);
});

test('profile management reuses canonical player, career and video data', () => {
  assert.match(agencyOs, /player_profile_save/);
  assert.match(agencyOs, /player_profile_publish/);
  assert.match(agencyOs, /player_profile_video_add/);
  assert.match(agencyOs, /career_entries/);
  assert.match(agencyOs, /player_videos/);
  assert.match(agencyOs, /profileAutoStats/);
});

test('link creation is not falsely labelled as sent', () => {
  assert.match(agencyOs, /pitch_status:"ready"/);
  assert.match(agencyOs, /sent_at:null/);
  assert.match(agencyOs, /player_profile\.share_link_created/);
  assert.doesNotMatch(manager, /return 'Sent'/);
  assert.match(manager, /return 'Ready'/);
});

test('protected club links carry tenant branding and genuine opens into the opportunity', () => {
  assert.match(migration, /platform\.tenant_branding/);
  assert.match(migration, /PLAYER_PROFILE_OPENED/);
  assert.match(migration, /Follow up after Player Profile opened/);
  assert.match(migration, /v_first_open/);
  assert.match(migration, /next_action_text/);
  assert.match(migration, /next_action_at/);
  assert.match(shareEdge, /track_club_share_view/);
});

test('raw privileged share RPCs are service-role only', () => {
  assert.match(migration, /revoke all on function public\.get_club_share/);
  assert.match(migration, /revoke all on function public\.track_club_share_view/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
});

test('normal public Player Profile pages receive agency branding through a public edge boundary', () => {
  assert.match(playerPage, /player-profile-public/);
  assert.match(playerPage, /agency=\{data\.agency\}/);
  assert.match(publicEdge, /tenant_branding/);
  assert.match(publicEdge, /verification_status/);
  assert.match(publicEdge, /published/);
});

test('visible product language says Player Profile rather than dossier', () => {
  assert.match(publicProfile, /PLAYER PROFILE/);
  assert.match(pdf, /PLAYER PROFILE/);
  assert.match(playerCv, /MY PLAYER PROFILE/);

  assert.doesNotMatch(
    publicProfile,
    /PLAYER DOSSIER|Download player dossier|player dossier PDF/i,
  );
  assert.doesNotMatch(
    pdf,
    /PLAYER DOSSIER|PROFESSIONAL PLAYER DOSSIER|Player-Dossier/i,
  );
  assert.doesNotMatch(
    playerCv,
    /MY CLUB DOSSIER|Your club-facing\s+dossier|in your club dossier/i,
  );
});
