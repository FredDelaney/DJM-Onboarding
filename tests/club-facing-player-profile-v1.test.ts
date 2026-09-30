import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profile = readFileSync(
  'components/PublicProfile.tsx',
  'utf8',
);
const pdf = readFileSync(
  'components/ClubCvPdf.tsx',
  'utf8',
);
const css = readFileSync(
  'app/dossier.css',
  'utf8',
);

test('club profile puts footage and external evidence near the top', () => {
  assert.match(profile, /const featuredLinks =/);
  assert.match(profile, /CLUB EVALUATION/);
  assert.match(profile, /Watch and verify/);
  assert.match(profile, /PLAYER RECORD/);
  assert.match(profile, /Transfermarkt/);
  assert.match(profile, /SCOUTING/);
  assert.match(profile, /Wyscout/);
  assert.match(profile, /PERFORMANCE DATA/);
});

test('primary video is never lost when selected_videos is empty', () => {
  assert.match(profile, /const selectedVideos =/);
  assert.match(profile, /profile\.primary_video_url \|\|/);
  assert.match(profile, /title: primaryVideoTitle/);
  assert.match(pdf, /profile\?\.primary_video_url \|\|/);
  assert.match(pdf, /WATCH FOOTAGE ↗/);
});

test('web profile treats the main video as a premium evaluation action', () => {
  assert.match(css, /Club-facing conversion layer v1/);
  assert.match(css, /\.dossier-evaluation-card\.is-video/);
  assert.match(css, /grid-column: span 2/);
  assert.match(css, /background:[\s\S]*linear-gradient/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.dossier-evaluation-card\.is-video[\s\S]*grid-column: 1 \/ -1/);
});

test('mobile profile prioritises written role before the pitch graphic', () => {
  assert.match(css, /Club-facing mobile role hierarchy v1/);
  assert.match(css, /\.dossier-player-profile-grid[\s\S]*flex-direction: column-reverse/);
  assert.match(css, /\.dossier-pitch[\s\S]*width: min\(46%, 164px\)/);
});

test('additional videos stay available without duplicating the primary footage card', () => {
  assert.match(profile, /videos\.length > 1/);
  assert.match(profile, /MORE FOOTAGE/);
  assert.match(profile, /More ways to watch/);
  assert.match(profile, /\.slice\([\s\S]*1,[\s\S]*4/);
});
