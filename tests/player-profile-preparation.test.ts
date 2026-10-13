import assert from 'node:assert/strict';
import test from 'node:test';

import {
  playerProfilePositionGroup,
  preparePlayerProfileEvidence,
  reviewPlayerProfileEvidence,
} from '../supabase/functions/_shared/player-profile-preparation.ts';

const player = {
  primary_position: 'ST',
  current_club: 'North FC',
  current_season_label: '2026/27',
  transfermarkt_url: 'https://www.transfermarkt.com/example/profil/spieler/123',
};

const currentRow = {
  id: 'career-current',
  season_label: '2026/27',
  club_name: 'North FC',
  league: 'First Division',
  appearances: 26,
  starts: 18,
  minutes: 1700,
  goals: 7,
  assists: 5,
  source_provider: 'wyscout',
  source_name: 'Wyscout',
  source_url: 'https://example.com/north-fc/season',
  source_synced_at: '2026-10-01T00:00:00Z',
};

test('position changes which existing stats are selected first', () => {
  assert.equal(playerProfilePositionGroup('GK'), 'goalkeeper');
  assert.equal(playerProfilePositionGroup('centre-back'), 'centre_back');
  assert.equal(playerProfilePositionGroup('right winger'), 'winger');

  const striker = preparePlayerProfileEvidence({ player, career: [currentRow] });
  assert.deepEqual(striker.featuredStats.map((stat) => stat.field), [
    'goals', 'starts', 'assists', 'minutes',
  ]);
  assert.deepEqual(striker.featuredStats[0], {
    ref: 'career-current:goals',
    careerEntryId: 'career-current',
    field: 'goals',
    label: 'Goals',
    value: 7,
    seasonLabel: '2026/27',
    competition: 'First Division',
    club: 'North FC',
    seasonScope: 'current',
    source: {
      provenance: 'verified',
      provider: 'wyscout',
      name: 'Wyscout',
      url: 'https://example.com/north-fc/season',
      reviewedAt: null,
      syncedAt: '2026-10-01T00:00:00Z',
    },
  });

  const keeper = preparePlayerProfileEvidence({
    player: { ...player, primary_position: 'Goalkeeper' },
    career: [currentRow],
  });
  assert.deepEqual(keeper.featuredStats.map((stat) => stat.field), [
    'starts', 'minutes', 'appearances',
  ]);
  assert.equal(keeper.featuredStats.some((stat) => stat.field === 'goals'), false);
});

test('unreviewed AI and unsourced rows cannot provide profile facts', () => {
  const result = preparePlayerProfileEvidence({
    player,
    career: [
      { ...currentRow, id: 'unreviewed-ai', source_provider: 'public_web_evidence' },
      { ...currentRow, id: 'unsourced', source_provider: null, source_synced_at: null },
      { ...currentRow, id: 'wrong-club', club_name: 'Other FC' },
    ],
  });
  assert.deepEqual(result.statCandidates, []);
  assert.ok(result.suggestions.some((item) => item.code === 'missing_current_stats'));
});

test('cross-checked AI web evidence becomes eligible without treating raw AI output as a fact', () => {
  const result = preparePlayerProfileEvidence({
    player,
    career: [{
      ...currentRow,
      id: 'cross-checked-web',
      source_provider: 'public_web_evidence',
      source_acceptance_method: 'ai_web_current_season_cross_checked_monotonic',
      source_reviewed_at: null,
    }],
  });
  assert.ok(result.statCandidates.some((stat) => stat.ref === 'cross-checked-web:goals'));
  assert.equal(result.statCandidates[0]?.source.provenance, 'verified');
});

test('tracked competition allows a generic parent club to use the matching reserve row', () => {
  const result = preparePlayerProfileEvidence({
    player: {
      ...player,
      current_club: 'Wellington Phoenix',
      current_league: 'Central League/National League',
      current_season_label: '2026',
    },
    career: [{
      ...currentRow,
      id: 'phoenix-reserves',
      season_label: '2026',
      club_name: 'Wellington Phoenix FC Reserves',
      league: 'Central League',
      appearances: 17,
    }],
  });
  assert.ok(result.statCandidates.some((stat) => stat.ref === 'phoenix-reserves:appearances'));
  assert.equal(result.suggestions.some((item) => item.code === 'missing_current_stats'), false);
});

test('operator-reviewed manual rows retain manual provenance and exact zero values', () => {
  const result = preparePlayerProfileEvidence({
    player,
    career: [{
      ...currentRow,
      source_provider: 'manual',
      source_url: null,
      source_synced_at: null,
      source_reviewed_at: '2026-10-02T12:00:00Z',
      goals: 0,
      assists: -1,
      minutes: 1700.5,
    }],
  });
  assert.equal(result.statCandidates.find((stat) => stat.field === 'goals')?.value, 0);
  assert.equal(result.statCandidates[0]?.source.provenance, 'manual');
  assert.equal(result.statCandidates.some((stat) => stat.field === 'assists'), false);
  assert.equal(result.statCandidates.some((stat) => stat.field === 'minutes'), false);
});

test('only current and immediately previous season evidence is eligible', () => {
  const result = preparePlayerProfileEvidence({
    player,
    career: [
      { ...currentRow, goals: null, assists: null },
      { ...currentRow, id: 'career-previous', season_label: '2025/26', club_name: 'South FC', goals: 13 },
      { ...currentRow, id: 'career-old', season_label: '2023/24', club_name: 'Old FC', goals: 30 },
    ],
  });
  assert.equal(result.statCandidates.some((stat) => stat.careerEntryId === 'career-old'), false);
  assert.equal(result.statCandidates.find((stat) => stat.ref === 'career-previous:goals')?.seasonScope, 'previous');
  assert.equal(result.featuredStats[0].seasonScope, 'current');
});

test('video candidates include only real links and select a featured video', () => {
  const result = preparePlayerProfileEvidence({
    player,
    career: [currentRow],
    videos: [
      { id: 'bad', url: 'javascript:alert(1)', featured: true },
      { id: 'first', title: 'Match film', url: 'https://video.example/1' },
      { id: 'featured', title: 'Highlights', url: 'https://video.example/2', featured: true },
    ],
  });
  assert.deepEqual(result.videoCandidates.map((video) => video.id), ['first', 'featured']);
  assert.equal(result.featuredVideoId, 'featured');
  assert.equal(result.suggestions.some((item) => item.code === 'missing_video'), false);
});

test('a generic URL does not count as a Transfermarkt player profile', () => {
  const suggestions = reviewPlayerProfileEvidence({
    player: { ...player, transfermarkt_url: 'https://example.com/profil/spieler/123' },
    career: [currentRow],
  });
  assert.ok(suggestions.some((item) => item.code === 'missing_transfermarkt'));
});

test('review flags stale evidence, missing links, invalid refs and long copy without changing facts', () => {
  const input = {
    player: { ...player, transfermarkt_url: null },
    career: [currentRow],
    videos: [{ id: 'film', url: 'https://video.example/1' }],
    now: '2026-11-02T00:00:00Z',
    draft: {
      featuredStatRefs: ['invented:goals', 'career-current:minutes'],
      primaryVideoId: null,
      introLine: 'a'.repeat(221),
    },
  };
  const before = structuredClone(input);
  const suggestions = reviewPlayerProfileEvidence(input);
  assert.deepEqual(input, before);
  assert.deepEqual(suggestions.map((item) => item.code), [
    'stale_current_stats',
    'feature_video',
    'missing_transfermarkt',
    'invalid_featured_stat',
    'stronger_stat_available',
    'long_introduction',
  ]);
  assert.match(suggestions[0].message, /32 days ago/);
});
