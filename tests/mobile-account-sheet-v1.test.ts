import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/AccountMenu.tsx', 'utf8');
const styles = readFileSync('components/AccountMenu.module.css', 'utf8');

test('mobile account access keeps the real profile identity visible', () => {
  assert.match(component, /profile\.email \|\| profile\.job_title/);
  assert.match(component, /agencyName.*human\(role\)/s);
});

test('opening account menu creates a dismissible mobile backdrop', () => {
  assert.match(component, /className=\{styles\.backdrop\}/);
  assert.match(component, /aria-label="Close account menu"/);
  assert.match(component, /onClick=\{\(\) => setOpen\(false\)\}/);
});

test('mobile account menu is a native-feeling bottom sheet rather than a desktop popover', () => {
  assert.match(styles, /ReDream mobile account sheet v1/);
  assert.match(styles, /\.menu[\s\S]*top: auto[\s\S]*bottom: 0[\s\S]*left: 0/);
  assert.match(styles, /border-radius: 26px 26px 0 0/);
  assert.match(styles, /accountSheetIn/);
  assert.match(styles, /\.menu::before/);
});

test('mobile rows remove secondary explanation while keeping clear navigation', () => {
  assert.match(styles, /\.item small[\s\S]*display: none/);
  assert.match(styles, /\.item::after[\s\S]*content: '›'/);
  assert.match(styles, /\.footer button[\s\S]*color: #a44b43/);
});
