import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ownerLaunch = readFileSync('app/activate/[tenantSlug]/page.tsx', 'utf8');
const activationCss = readFileSync('app/activate/[tenantSlug]/page.module.css', 'utf8');

test('first value teaches the core ReDream operating habit instead of ending in manual navigation', () => {
  assert.match(ownerLaunch, /tell it what happened in plain language/i);
  assert.match(ownerLaunch, /Try Tell ReDream now/);
  assert.match(ownerLaunch, /Review before anything changes/);
  assert.match(ownerLaunch, /Work from Today/);
  assert.doesNotMatch(ownerLaunch, /Enter live opportunities/);
});

test('first capture is contextual to the real first player and workspace', () => {
  assert.match(ownerLaunch, /firstPlayerName/);
  assert.match(ownerLaunch, /firstCaptureHref/);
  assert.match(ownerLaunch, /context_type: 'player'/);
  assert.match(ownerLaunch, /player_id: firstPlayer\.id/);
  assert.match(ownerLaunch, /player_name: firstPlayerName/);
  assert.match(ownerLaunch, /\/workspace\/\$\{encodeURIComponent\(runtime\.slug\)\}\/capture/);
});

test('owner can skip the lesson without being trapped and lands on Today', () => {
  assert.match(ownerLaunch, /Skip for now and open Today/);
  assert.match(ownerLaunch, /\?view=home&handoff=first-value/);
});

test('first daily habit is responsive and activation scoped', () => {
  assert.match(activationCss, /\.firstHabit\s*\{/);
  assert.match(activationCss, /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(activationCss, /@media \(max-width: 760px\)[\s\S]*\.firstHabit/);
});
