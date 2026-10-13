import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const player = readFileSync('components/AgencyPlayerProfile.tsx', 'utf8');
const pursuit = readFileSync('components/AgencyPursuitRoom.tsx', 'utf8');
const capture = readFileSync('components/AiCapture.tsx', 'utf8');

test('Player Profile turns the first required blocker into the primary action', () => {
  assert.match(player, /const primaryRequiredCheck = guidedRequiredChecks\[0\]/);
  assert.match(player, /canPublishFromHero \? \(/);
  assert.match(player, /runProfileCheck\(primaryRequiredCheck\)/);
  assert.match(player, /Next move/);
  assert.match(player, /More\s*<ChevronDown/);
});

test('Pursuit Room exposes one executable next move across the full route', () => {
  assert.match(pursuit, /const nextMove = \(\(\) =>/);
  for (const label of [
    'Review career plan',
    'Create private dossier',
    'Publish dossier',
    'Create private pitch',
    'Publish pitch link',
    'I sent this pitch',
    'Prepare response review',
    'Assign owner',
    'Set follow-up',
    'Open Deal War Room',
  ]) {
    assert.match(pursuit, new RegExp(label));
  }
  assert.match(pursuit, /onClick=\{nextMove\.run\}/);
});

test('Tell ReDream becomes review-first after a capture exists', () => {
  assert.match(capture, /!receipt\?\.capture \? \(/);
  assert.match(capture, /Approve & save/);
  assert.match(capture, /Update complete/);
  assert.match(capture, /Capture another update/);
  assert.match(capture, /setReceipt\(null\)/);
});
