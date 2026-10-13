import assert from 'node:assert/strict';
import test from 'node:test';

import { selectPlayerProfilePresentation } from '../supabase/functions/_shared/player-profile-ai.ts';
import { preparePlayerProfileEvidence } from '../supabase/functions/_shared/player-profile-preparation.ts';

const evidence = preparePlayerProfileEvidence({
  player: {
    primary_position: 'ST', current_club: 'North FC', current_season_label: '2026/27',
  },
  career: [{
    id: 'recorded-season', season_label: '2026/27', club_name: 'North FC',
    league: 'First Division', appearances: 26, starts: 18, minutes: 1700,
    goals: 7, assists: 5, source_provider: 'wyscout', source_name: 'Wyscout',
    source_url: 'https://example.com/recorded-season', source_synced_at: '2026-10-01T00:00:00Z',
  }],
  videos: [{ id: 'recorded-film', title: 'Highlights', url: 'https://video.example/film' }],
});

const input = {
  mode: 'club' as const,
  player: {
    displayName: 'Alex North', primaryPosition: 'ST', currentClub: 'North FC',
    currentSeasonLabel: '2026/27',
  },
  club: { name: 'Target FC', league: 'First Division', positionNeed: 'ST' },
  statCandidates: evidence.statCandidates,
  videoCandidates: evidence.videoCandidates,
};

const modelResponse = (selection: unknown) => new Response(JSON.stringify({
  output: [{ content: [{ type: 'output_text', text: JSON.stringify(selection) }] }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('no API key returns deterministic sourced selection without contacting a model', async () => {
  let called = false;
  const result = await selectPlayerProfilePresentation(input, {
    fetchImpl: (async () => { called = true; throw Error('unexpected'); }) as typeof fetch,
  });
  assert.equal(called, false);
  assert.equal(result.source, 'fallback');
  assert.equal(result.reason, 'no_api_key');
  assert.equal(result.selectedStatRefs[0], 'recorded-season:goals');
  assert.equal(result.selectedVideoId, 'recorded-film');
  assert.match(result.introLine, /7 goals/);
  assert.match(result.introLine, /Prepared for Target FC/);
});

test('out-of-list refs and model-authored prose are rejected', async () => {
  for (const selection of [
    { selected_stat_refs: ['made-up-season:goals'], selected_video_id: 'recorded-film', focus: 'goal_threat' },
    { selected_stat_refs: ['recorded-season:goals'], selected_video_id: 'made-up-film', focus: 'goal_threat' },
    { selected_stat_refs: ['recorded-season:goals'], selected_video_id: 'recorded-film', focus: 'goal_threat', intro_line: '99 goals' },
    { selected_stat_refs: ['recorded-season:starts'], selected_video_id: 'recorded-film', focus: 'goal_threat' },
  ]) {
    const result = await selectPlayerProfilePresentation(input, {
      apiKey: 'test-key', fetchImpl: (async () => modelResponse(selection)) as typeof fetch,
    });
    assert.equal(result.source, 'fallback');
    assert.equal(result.reason, 'invalid_model_output');
    assert.match(result.introLine, /7 goals/);
    assert.doesNotMatch(result.introLine, /99 goals/);
  }
});

test('model failure falls back to the same source-bound selection', async () => {
  const result = await selectPlayerProfilePresentation(input, {
    apiKey: 'test-key', fetchImpl: (async () => { throw Error('network'); }) as typeof fetch,
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.reason, 'model_error');
  assert.deepEqual(result.selectedStatRefs, evidence.featuredStats.map((stat) => stat.ref));
});

test('valid structured selection changes ordering only and copy uses recorded facts', async () => {
  let request: RequestInit | undefined;
  const result = await selectPlayerProfilePresentation(input, {
    apiKey: 'test-key',
    fetchImpl: (async (_url, init) => {
      request = init;
      return modelResponse({
        selected_stat_refs: ['recorded-season:assists', 'recorded-season:goals'],
        selected_video_id: 'recorded-film',
        focus: 'creation',
      });
    }) as typeof fetch,
  });
  assert.equal(result.source, 'ai');
  assert.equal(result.focus, 'creation');
  assert.deepEqual(result.selectedStatRefs, ['recorded-season:assists', 'recorded-season:goals']);
  assert.match(result.introLine, /5 assists/);
  assert.match(result.introLine, /7 goals/);
  assert.doesNotMatch(result.introLine, /fit|elite|potential/i);
  const body = JSON.parse(String(request?.body));
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(Object.keys(body.text.format.schema.properties), [
    'selected_stat_refs', 'selected_video_id', 'focus',
  ]);
});
