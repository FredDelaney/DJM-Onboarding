import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const css = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');

test('mobile agency shell does not mount a translucent top fade layer', () => {
  assert.doesNotMatch(shell, /mobileScrolled/);
  assert.doesNotMatch(shell, /styles\.mobileTopVeil/);
  assert.match(css, /Mobile top clarity v2/);
  assert.doesNotMatch(css, /mobileTopVeil/);
});
