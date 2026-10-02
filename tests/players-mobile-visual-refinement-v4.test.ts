import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('components/AgencyPlayersWorkspace.module.css', 'utf8');

test('Players mobile section switcher is balanced and centred', () => {
  assert.match(css, /Players mobile visual refinement v4/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /justify-content: center/);
  assert.match(css, /min-height: 48px/);
});

test('Players mobile cards keep the action indicator aligned with Profile', () => {
  assert.match(css, /\.playerCardEnd[\s\S]*display: flex/);
  assert.match(css, /\.attentionPill[\s\S]*flex: 0 0 8px/);
  assert.match(css, /\.profileShortcut[\s\S]*min-height: 36px/);
});
