import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');

test('hero Home CTA is a compact rounded square rather than a circle', () => {
  assert.match(css, /Home CTA treatment v8/);
  assert.match(css, /\.attentionCardPrimary \.compactButton[\s\S]*width: 42px[\s\S]*border-radius: 14px/);
});

test('secondary Home CTAs have no visible circular background', () => {
  assert.match(css, /\.attentionCard:not\(\.attentionCardPrimary\) \.compactButton[\s\S]*border-radius: 0/);
  assert.match(css, /\.attentionCard:not\(\.attentionCardPrimary\) \.compactButton[\s\S]*background: transparent/);
  assert.match(css, /\.attentionCard:not\(\.attentionCardPrimary\) \.compactButton[\s\S]*box-shadow: none/);
});
