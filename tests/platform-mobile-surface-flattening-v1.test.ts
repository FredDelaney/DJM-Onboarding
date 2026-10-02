import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const globalBeauty = readFileSync('app/djm-global-beauty.css', 'utf8');

test('authenticated mobile surfaces do not use decorative background haze', () => {
  assert.match(globalBeauty, /Platform-wide mobile surface flattening v1/);
  assert.match(globalBeauty, /@media \(max-width: 760px\)[\s\S]*\.djm-os-root[\s\S]*\.ux-player-root/);
  assert.match(globalBeauty, /background-image: none !important/);
  assert.match(globalBeauty, /background: #f5f6f8 !important/);
});
