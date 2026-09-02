import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('components/ConnectionsPanel.tsx', 'utf8');

test('Connections presents only capabilities that are actually live', () => {
  assert.doesNotMatch(source, /Supabase project switch/);
  assert.doesNotMatch(source, /transactional email sender/);
  assert.doesNotMatch(source, /Coming on switch/);
  assert.match(source, /\{passkeysEnabled \? \(/);
  assert.match(source, /\{emailDelivery\.enabled \? \(/);
});

test('Connections exposes clear accessible interaction state', () => {
  assert.match(source, /aria-pressed=\{preferences\.reminder_intensity === value\}/);
  assert.match(source, /className=\{styles\.error\} role="alert"/);
  assert.match(source, /className=\{styles\.success\} role="status"/);
});

test('Connections keeps the finished DJM security language', () => {
  assert.match(source, /Secure access, simple recovery\./);
  assert.match(source, /Recover access through your confirmed DJM email\./);
});
