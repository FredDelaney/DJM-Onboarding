import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.tsx', 'utf8');
const css = readFileSync('components/AgencyOperatingWorkspace.module.css', 'utf8');

test('mobile top fade is driven by actual page scroll position', () => {
  assert.match(shell, /mobileScrolled/);
  assert.match(shell, /window\.scrollY > 64/);
  assert.match(shell, /addEventListener\('scroll'/);
  assert.match(shell, /mobileScrolled \? \(/);
});

test('mobile top veil is not mounted at rest and fades in only after meaningful scrolling', () => {
  assert.match(shell, /mobileScrolled \? \([\s\S]*styles\.mobileTopVeil/);
  assert.doesNotMatch(css, /\.mobileTopVeilVisible/);
  assert.match(css, /@keyframes mobileTopVeilIn/);
  assert.match(css, /backdrop-filter: blur\(12px\)/);
});
