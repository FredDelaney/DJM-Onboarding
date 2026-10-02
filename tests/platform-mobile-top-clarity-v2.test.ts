import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const shellCss = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');
const staffCss = readFileSync('app/staff-mobile-layout-fix.css','utf8');

test('agency workspace does not mount a translucent top veil', () => {
  assert.doesNotMatch(shell, /mobileScrolled/);
  assert.doesNotMatch(shell, /styles\.mobileTopVeil/);
  assert.match(shellCss, /Mobile top clarity v2/);
  assert.doesNotMatch(shellCss, /mobileTopVeil/);
});

test('global authenticated mobile headers disable blur and filters', () => {
  assert.match(staffCss, /Platform mobile header clarity v1/);
  assert.match(staffCss, /\.ux-staff-header,[\s\S]*\.djm-os-header,[\s\S]*\.player-workspace-header/);
  assert.match(staffCss, /backdrop-filter: none !important/);
  assert.match(staffCss, /filter: none !important/);
});
