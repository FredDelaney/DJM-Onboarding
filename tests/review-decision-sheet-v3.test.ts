import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/AgencyActionDrawer.tsx','utf8');
const css = readFileSync('components/AgencyActionDrawer.module.css','utf8');

test('review-only drawer gets its own premium decision-sheet scope', () => {
  assert.match(component, /reviewOnly \? styles\.reviewDrawer/);
  assert.match(css, /Premium review-only decision sheet v3/);
  assert.match(css, /\.reviewDrawer[\s\S]*border-radius: 30px 30px 0 0/);
});

test('review-only metadata removes redundant Type and uses compact chips', () => {
  assert.match(component, /filter\(\(fact\) => fact\.label\.trim\(\)\.toLowerCase\(\) !== 'type'\)/);
  assert.match(component, /styles\.reviewMeta/);
  assert.match(css, /\.reviewMeta \.evidenceFact[\s\S]*display: inline-flex/);
});

test('review-only sheet has a distinct insight block and decision block', () => {
  assert.match(component, /WHY THIS MATTERS/);
  assert.match(component, /DECISION REQUIRED/);
  assert.match(component, /Your judgement is required/);
  assert.match(css, /\.reviewWhy[\s\S]*background: #f8faf7/);
  assert.match(css, /\.reviewOnly[\s\S]*background: #f6f8fa/);
});

test('review-only fallback becomes a focused opportunity CTA', () => {
  assert.match(component, /Review opportunity/);
  assert.match(component, /ChevronRight size=\{17\}/);
  assert.match(css, /\.reviewDrawer \.fallback[\s\S]*background: #092b47/);
});
