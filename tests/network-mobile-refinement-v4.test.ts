import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('components/AgencyNetworkWorkspace.module.css','utf8');
const final = css.slice(css.lastIndexOf('Network mobile refinement v4'));

test('Network mobile cards no longer use tenant accent for decorative treatment', () => {
  assert.doesNotMatch(final, /var\(--agency-accent\)/);
  assert.match(final, /\.clubCard::before,[\s\S]*display: none/);
  assert.match(final, /\.identity \.eyebrow[\s\S]*color: var\(--network-slate\)/);
});

test('Network mobile cards use flattened route and next-move hierarchy', () => {
  assert.match(final, /\.primaryFact[\s\S]*border-top: 1px solid #edf0f2/);
  assert.match(final, /\.nextMove[\s\S]*background: transparent/);
  assert.match(final, /\.nextMove::before[\s\S]*background: #9aa9b4/);
});

test('Network action controls use compact navy treatment', () => {
  assert.match(final, /\.clubCard \.primaryAction[\s\S]*background: #0b2d49/);
  assert.match(final, /\.clubCard \.secondaryAction[\s\S]*width: 40px/);
});
