import assert from 'node:assert/strict';
import test from 'node:test';

import { suggestPlayerProfileTextImprovement } from '../supabase/functions/_shared/player-profile-text-improvement.ts';

const response = (value: unknown) => new Response(JSON.stringify({
  output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('missing key leaves the selected section unchanged and makes no model call', async () => {
  let called = false;
  const result = await suggestPlayerProfileTextImprovement({
    section: 'why_review', style: 'shorter',
    text: 'He is a striker. He has 7 goals this season. This is useful for the profile.',
  }, { fetchImpl: (async () => { called = true; throw Error('unexpected'); }) as typeof fetch });
  assert.equal(called, false);
  assert.equal(result.status, 'unchanged');
  assert.equal(result.requiresApproval, false);
});

test('AI may only select existing sentences in order and returns an approval-required suggestion', async () => {
  const original = 'A short opening. He has 7 goals in 2026/27. An extra general sentence.';
  const result = await suggestPlayerProfileTextImprovement({
    section: 'intro_line', style: 'football_focused', text: original,
  }, {
    apiKey: 'test-key',
    fetchImpl: (async () => response({ selected_segment_indices: [1] })) as typeof fetch,
  });
  assert.equal(result.status, 'suggested');
  assert.equal(result.section, 'intro_line');
  assert.equal(result.suggestedText, 'He has 7 goals in 2026/27.');
  assert.equal(result.originalText, original);
  assert.equal(result.requiresApproval, true);
});

test('qualifiers and numbers cannot be dropped from a selected text section', async () => {
  const result = await suggestPlayerProfileTextImprovement({
    section: 'why_review', style: 'shorter',
    text: 'He has 7 goals. This figure is pending verification. A useful extra sentence.',
  }, {
    apiKey: 'test-key',
    fetchImpl: (async () => response({ selected_segment_indices: [0] })) as typeof fetch,
  });
  assert.equal(result.status, 'unchanged');
  assert.equal(result.reason, 'invalid_model_output');
});

test('model-authored prose and out-of-range indices are rejected', async () => {
  for (const output of [
    { selected_segment_indices: [0], suggested_text: 'An elite scorer.' },
    { selected_segment_indices: [100] },
    { selected_segment_indices: [1, 0] },
  ]) {
    const result = await suggestPlayerProfileTextImprovement({
      section: 'career_summary', style: 'clearer', text: 'First sentence. Second sentence.',
    }, { apiKey: 'test-key', fetchImpl: (async () => response(output)) as typeof fetch });
    assert.equal(result.status, 'unchanged');
    assert.equal(result.reason, 'invalid_model_output');
  }
});

test('club tailoring adds only the supplied club audience and existing copy', async () => {
  const result = await suggestPlayerProfileTextImprovement({
    section: 'intro_line', style: 'tailor_to_club', clubName: 'Target FC',
    text: 'He plays for North FC. He has 7 goals. A general closing line.',
  }, {
    apiKey: 'test-key',
    fetchImpl: (async () => response({ selected_segment_indices: [0, 1] })) as typeof fetch,
  });
  assert.equal(result.status, 'suggested');
  assert.equal(result.suggestedText, 'Prepared for Target FC. He plays for North FC. He has 7 goals.');
  assert.doesNotMatch(result.suggestedText, /perfect fit|elite|guarantee/i);
});

test('model failure and overlong text never change the section', async () => {
  const failed = await suggestPlayerProfileTextImprovement({
    section: 'intro_line', style: 'more_direct', text: 'First sentence. Second sentence.',
  }, { apiKey: 'test-key', fetchImpl: (async () => { throw Error('network'); }) as typeof fetch });
  assert.equal(failed.status, 'unchanged');
  assert.equal(failed.reason, 'model_error');

  const tooLong = await suggestPlayerProfileTextImprovement({
    section: 'why_review', style: 'shorter', text: 'x'.repeat(1201),
  }, { apiKey: 'test-key' });
  assert.equal(tooLong.reason, 'invalid_input');
});
