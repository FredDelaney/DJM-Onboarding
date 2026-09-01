import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const launcher = readFileSync('components/DjmTellDjmLauncher.tsx', 'utf8');
const styles = readFileSync('components/DjmTellDjmLauncher.module.css', 'utf8');

test('Tell DJM popup escapes header stacking contexts through a body portal', () => {
  assert.match(launcher, /createPortal/);
  assert.match(launcher, /document\.body/);
});

test('Tell DJM closes from the backdrop without closing from inside the modal', () => {
  assert.match(launcher, /event\.target !== event\.currentTarget \|\| unsafeToClose/);
  assert.match(launcher, /setOpen\(false\)/);
});

test('Tell DJM mobile popup respects the dynamic viewport and iPhone safe areas', () => {
  assert.match(styles, /100dvh/);
  assert.match(styles, /safe-area-inset-top/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /z-index:\s*10000/);
});

test('Tell DJM locks background scrolling while the popup is open', () => {
  assert.match(launcher, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(launcher, /document\.body\.style\.overflow = previousOverflow/);
});
