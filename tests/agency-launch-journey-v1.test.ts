import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'app/platform/AgencyActionBar.tsx',
  'utf8',
);

const css = readFileSync(
  'app/platform/AgencyActionBar.module.css',
  'utf8',
);

test('platform launch surface exposes the complete sellable agency journey', () => {
  assert.match(source, /aria-label="Agency launch journey"/);
  assert.match(source, /Create agency/);
  assert.match(source, /Owner activation/);
  assert.match(source, /Branded workspace/);
  assert.match(source, /First player/);
  assert.match(source, /First value/);
  assert.match(source, /Go live/);
});

test('launch milestones are derived from canonical customer evidence', () => {
  assert.match(source, /action: 'customer_detail'/);
  assert.match(source, /membership\.role/);
  assert.match(source, /workspace_ready/);
  assert.match(source, /roster_players/);
  assert.match(source, /first_value_ready/);
  assert.match(source, /ready_for_player_invites/);
  assert.match(source, /go_live_at/);
});

test('launch actions route into existing controls and retain guarded go-live', () => {
  assert.match(source, /onFocus\('activation-control'\)/);
  assert.match(source, /onFocus\('domain-control'\)/);
  assert.match(source, /onFocus\('privacy-control'\)/);
  assert.match(source, /onFocus\('go-live-control'\)/);
  assert.match(source, /action === 'go_live_customer'/);
  assert.match(source, /server will re-check launch readiness/i);
});

test('launch surface has a dedicated responsive visual treatment', () => {
  assert.match(css, /\.steps\s*\{/);
  assert.match(css, /grid-template-columns:\s*repeat\(6/);
  assert.match(css, /\.stepActive/);
  assert.match(css, /\.nextMove/);
  assert.match(css, /\.progressComplete/);
});

test('launch journey does not create a manual milestone completion action', () => {
  assert.doesNotMatch(source, /complete_launch_step/);
  assert.doesNotMatch(source, /set_launch_milestone/);
  assert.doesNotMatch(source, /mark_first_value/);
});
