import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profile = readFileSync('components/AgencyPlayerProfile.tsx', 'utf8');
const css = readFileSync('components/AgencyPlayerProfile.module.css', 'utf8');
const publicEdge = readFileSync('supabase/functions/player-profile-public/index.ts', 'utf8');
const agencyEdge = readFileSync('supabase/functions/agency-os/index.ts', 'utf8');

test('preparation stays in the existing Player Profile and supports general or a known club', () => {
  assert.match(profile, /Prepare Profile/);
  assert.match(profile, /aria-pressed=\{prepareKind === 'general'\}/);
  assert.match(profile, /aria-pressed=\{prepareKind === 'club'\}/);
  assert.match(profile, /player_profile_prepare/);
  assert.match(profile, /player_data_refresh/);
  assert.match(profile, /player_data_status/);
  assert.match(profile, /player_context_research/);
  assert.match(profile, /player_context_apply/);
  assert.match(profile, /Apply & continue/);
  assert.match(profile, /20 \* 60 \* 60 \* 1000/);
  assert.match(profile, /organisation_id: prepareClub/);
  assert.match(profile, /deal_room_id: prepareDeal \|\| null/);
});

test('the agent edits presentation while statistics and video stay bound to returned evidence', () => {
  const prepare = profile.slice(profile.indexOf('const adoptPreparedProfile ='), profile.indexOf('const reviewProfile ='));
  const save = profile.slice(profile.indexOf('const savePreparedProfile ='), profile.indexOf('const publishProfile ='));
  assert.match(prepare, /availableRefs\.has\(ref\)/);
  assert.match(prepare, /videos\.some\(\(video\) => video\.id === videoId\)/);
  assert.match(profile, /Choose up to six recorded stats/);
  assert.match(profile, /selected_stat_refs: proposal\.selected_stat_refs/);
  assert.match(profile, /selected_video_id: proposal\.selected_video_id/);
  assert.match(save, /player_profile_version_save/);
  assert.match(save, /saveSettings\(false/);
  assert.doesNotMatch(save, /player_profile_verify|from\('players'\)|from\("players"\)/);
});

test('review is read-only and a club share uses only an approved version for its chosen club', () => {
  assert.match(profile, /player_profile_review/);
  assert.match(profile, /profileReview\.suggestions/);
  assert.match(profile, /version\.status === 'approved'/);
  assert.match(profile, /version\.organisation_id === organisationId/);
  assert.match(profile, /!version\.deal_room_id \|\| version\.deal_room_id === shareDeal/);
  assert.match(profile, /profile_version_id: shareVersionId \|\| null/);
  assert.match(profile, /Preview selected club profile/);
  assert.match(agencyEdge, /id\(deal\.organisation_id\)!==organisationId/);
});

test('published source-selected statistics remain the public General snapshot', () => {
  assert.match(publicEdge, /select\("key_stats,selected_stat_refs"\)/);
  assert.match(publicEdge, /customStats\|\|selectedSourceStats\?profileResult\.data\.key_stats:auto\.stats/);
  assert.match(profile, /key_stats: \[\], selected_stat_refs: \[\]/);
});

test('mobile preparation keeps actions and controls tappable without a parallel profile renderer', () => {
  assert.match(css, /\.prepareModes,\s*\.prepareTargets \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.prepareFooter button \{ min-width: 0; min-height: 44px; \}/);
  assert.match(css, /\.selectedStats button,\s*\.availableStats button,\s*\.prepareSections button \{ min-height: 44px; \}/);
  assert.match(profile, /<PublicProfile\s+profile=\{previewProfile \|\| draftProfile\}/);
});
