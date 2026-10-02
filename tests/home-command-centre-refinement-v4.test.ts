import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync('components/AgencyOperatingWorkspace.tsx', 'utf8');
const css = readFileSync('components/AgencyOperatingWorkspace.module.css', 'utf8');

test('Home uses a consistent command-centre section hierarchy', () => {
  assert.match(home, /Priority queue/);
  assert.match(home, /Your day/);
  assert.match(home, /Recent activity/);
  assert.match(home, /styles\.homeChangedPanel/);
  assert.match(css, /Home command centre refinement v4/);
});

test('Home circular action arrows are optically centred', () => {
  assert.match(css, /\.attentionCardPrimary \.compactButton[\s\S]*display: grid[\s\S]*place-items: center/);
  assert.match(css, /\.attentionCardPrimary \.compactButton svg[\s\S]*translateX\(\.75px\)/);
  assert.match(css, /\.attentionCard:not\(\.attentionCardPrimary\) \.compactButton[\s\S]*place-items: center/);
});

test('Home recent activity uses a dedicated message icon surface', () => {
  assert.match(home, /styles\.homeChangeIcon/);
  assert.match(css, /\.homeChangeIcon[\s\S]*border-radius: 10px/);
});
