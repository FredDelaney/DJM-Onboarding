import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/launch/page.tsx', 'utf8');
const css = readFileSync('app/launch/page.module.css', 'utf8');

test('owner launch presents one simple job at a time', () => {
  assert.match(page, /title: 'Set up your agency\.'/);
  assert.match(page, /title: 'Add your privacy notice\.'/);
  assert.match(page, /title: 'Add your first player\.'/);
  assert.match(page, /title: 'Add a club contact\.'/);
  assert.match(page, /title: 'Add something live\.'/);
});

test('owner launch does not expose internal platform status in the primary setup path', () => {
  assert.doesNotMatch(page, /Workspace address/);
  assert.doesNotMatch(page, /Working value/);
  assert.doesNotMatch(page, /Launch readiness/);
  assert.doesNotMatch(page, /Being connected by the platform team/);
});

test('mobile launch reduces the step rail to compact progress', () => {
  assert.match(css, /ReDream launch flow visual reset v1/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.steps[\s\S]*display: none/);
  assert.match(css, /\.progressTrack[\s\S]*height: 4px/);
  assert.match(css, /\.rail[\s\S]*border: 0[\s\S]*background: transparent/);
});

test('mobile setup form is part of the page instead of another card dashboard', () => {
  assert.match(css, /\.workCard[\s\S]*padding: 6px 0 0[\s\S]*border: 0/);
  assert.match(css, /\.field input,[\s\S]*font-size: 16px/);
  assert.match(css, /\.primaryButton[\s\S]*width: 100%[\s\S]*min-height: 48px/);
});

test('launch still hands first-value owners into the operating workspace', () => {
  assert.match(page, /launch\.activation\?\.first_value_ready/);
  assert.match(page, /window\.location\.assign\('\/agency'\)/);
  assert.match(page, /Open operating workspace/);
});
