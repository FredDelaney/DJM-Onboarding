import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const styles = readFileSync('components/AgencyOperatingWorkspace.module.css', 'utf8');
const navigation = readFileSync('components/AgencyMobileNavigation.module.css', 'utf8');

test('mobile workspace respects iPhone top and bottom safe areas', () => {
  assert.match(styles, /padding-top: calc\(18px \+ env\(safe-area-inset-top, 0px\)\)/);
  assert.match(styles, /--workspace-mobile-navigation-inset:calc\(65px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(navigation, /padding: 5px 8px max\(5px, env\(safe-area-inset-bottom\)\)/);
});

test('mobile bottom navigation is compact and visually centred', () => {
  assert.match(navigation, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(navigation, /min-height: 54px/);
  assert.match(navigation, /align-items: center/);
  assert.match(navigation, /justify-content: center/);
});

test('mobile active navigation keeps the same geometry as the other destinations', () => {
  const active = navigation.match(/\.bar > a\[aria-current\],[\s\S]*?\{([^}]+)\}/)?.[1] || '';
  assert.match(active, /color:/);
  assert.doesNotMatch(active, /height:|padding:|transform:|box-shadow:/);
});
