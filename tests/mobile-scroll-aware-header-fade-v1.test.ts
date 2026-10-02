import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.tsx', 'utf8');
const css = readFileSync('components/AgencyOperatingWorkspace.module.css', 'utf8');

test('mobile top fade is driven by actual page scroll position', () => {
  assert.match(shell, /mobileScrolled/);
  assert.match(shell, /window\.scrollY > 10/);
  assert.match(shell, /addEventListener\('scroll'/);
  assert.match(shell, /styles\.mobileTopVeilVisible/);
});

test('mobile top veil is invisible at rest and appears only after scrolling', () => {
  assert.match(css, /\.mobileTopVeil[\s\S]*opacity: 0/);
  assert.match(css, /\.mobileTopVeilVisible[\s\S]*opacity: 1/);
  assert.match(css, /backdrop-filter: blur\(12px\)/);
});
