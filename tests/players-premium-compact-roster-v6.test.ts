import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/AgencyPlayersWorkspace.tsx', 'utf8');
const css = readFileSync('components/AgencyPlayersWorkspace.module.css', 'utf8');

test('mobile roster uses compact contract and opportunity metadata', () => {
  assert.match(component, /styles\.mobilePlayerMeta/);
  assert.match(component, /Contract not recorded/);
  assert.match(component, /active .*opportunit/);
  assert.match(css, /Premium compact roster v6/);
  assert.match(css, /\.mobilePlayerMeta[\s\S]*display: flex/);
});

test('mobile roster uses one clear next-action strip instead of the desktop fact grid', () => {
  assert.match(component, /styles\.mobileNextAction/);
  assert.match(component, /styles\.mobileNextActionBody/);
  assert.match(css, /\.mobileNextAction[\s\S]*border-radius: 15px/);
  assert.match(css, /\.playerFacts[\s\S]*display: none/);
});

test('attention status is functional inside the next-action strip', () => {
  assert.match(component, /mobileStatusDot/);
  assert.match(component, /mobileStatusDotCalm/);
  assert.doesNotMatch(css.slice(css.indexOf('Premium compact roster v6')), /playerCardEnd \.attentionPill[\s\S]*position: absolute/);
});
