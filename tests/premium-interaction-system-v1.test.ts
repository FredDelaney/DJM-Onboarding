import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const files = [
  'components/AgencyOperatingWorkspace.module.css',
  'components/AgencyPlayersWorkspace.module.css',
  'components/AgencyOpportunitiesWorkspace.module.css',
  'components/AgencyNetworkWorkspace.module.css',
  'components/AgencyCalendarWorkspace.module.css',
];

const css = files.map((file) => readFileSync(file, 'utf8'));

test('premium interaction system covers every everyday workspace', () => {
  for (const source of css) {
    assert.match(source, /Premium interaction system v1/);
    assert.match(source, /touch-action: manipulation/);
    assert.match(source, /prefers-reduced-motion: reduce/);
  }
});

test('mobile interactions have clear keyboard focus treatment', () => {
  for (const source of css) {
    assert.match(source, /:focus-visible[\s\S]*outline: 3px solid/);
  }
});

test('single-action mobile rows provide pressed feedback', () => {
  assert.match(css[0], /attentionCard:has\(\.compactButton:active\)/);
  assert.match(css[1], /playerCard\[role='button'\]:active/);
  assert.match(css[2], /row:has\(\.action:active\)/);
  assert.match(css[4], /row:has\(\.action:active\)/);
});
