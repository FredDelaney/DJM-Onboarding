import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const raw = readFileSync(
  'tests/fixtures/tell-redream-natural-language-benchmark-v1.json',
  'utf8',
);
const benchmark = JSON.parse(raw);

test('Tell ReDream natural-language benchmark contains ten unique agency scenarios', () => {
  assert.equal(benchmark.cases.length, 10);
  const ids = benchmark.cases.map((item: any) => item.id);
  assert.equal(new Set(ids).size, 10);
  assert.deepEqual(ids, ['b01','b02','b03','b04','b05','b06','b07','b08','b09','b10']);
});

test('benchmark covers the high-value universal-capture behaviours', () => {
  const byId = Object.fromEntries(
    benchmark.cases.map((item: any) => [item.id, item]),
  );

  assert.deepEqual(byId.b01.expect.actions, [
    'log_interaction',
    'upsert_club_need',
    'suggest_player',
    'create_task',
  ]);
  assert.equal(byId.b01.expect.owner, 'Jesse Edge');
  assert.equal(byId.b03.expect.player, 'Kota');
  assert.equal(byId.b03.expect.contact, null);
  assert.deepEqual(byId.b06.expect.forbid_actions, ['upsert_club_need']);
  assert.equal(byId.b07.expect.task_status, 'needs_review');
  assert.equal(byId.b07.expect.owner_user_id, null);
  assert.deepEqual(byId.b08.expect.actions, []);
  assert.deepEqual(byId.b10.expect.forbid_actions, ['create_task']);
  assert.equal(byId.b10.expect.contact, null);
});

test('benchmark language stays conversational and user-facing source contains no em dash', () => {
  assert.match(byText('b02'), /I'll handle it/);
  assert.match(byText('b04'), /really explosive/);
  assert.match(byText('b08'), /Quick one/);
  assert.equal(raw.includes('\u2014'), false);
});

function byText(id: string) {
  return benchmark.cases.find((item: any) => item.id === id)?.input || '';
}
