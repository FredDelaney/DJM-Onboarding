import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rootCss = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');
const networkCss = readFileSync('components/AgencyNetworkWorkspace.module.css','utf8');
const networkFinal = networkCss.slice(networkCss.lastIndexOf('Network action controls v5'));

test('authenticated mobile buttons cannot wrap labels into stacked blocks', () => {
  const final = rootCss.slice(rootCss.lastIndexOf('Authenticated mobile control system v1'));
  assert.match(final, /\.root button[\s\S]*white-space: nowrap/);
  assert.match(final, /word-break: normal/);
  assert.match(final, /overflow-wrap: normal/);
});

test('authenticated icon-only buttons are hard-centred', () => {
  const final = rootCss.slice(rootCss.lastIndexOf('Authenticated mobile control system v1'));
  assert.match(final, /button\[aria-label\]:has\(> svg:only-child\)[\s\S]*display: grid[\s\S]*place-items: center/);
});

test('Network Open club action is always horizontal and readable', () => {
  assert.match(networkFinal, /\.clubCard \.secondaryAction[\s\S]*min-width: 96px/);
  assert.match(networkFinal, /font-size: 10px/);
  assert.match(networkFinal, /white-space: nowrap/);
  assert.match(networkFinal, /\.actionsSolo \.secondaryAction[\s\S]*width: 100%/);
  assert.doesNotMatch(networkFinal, /font-size: 0/);
});
