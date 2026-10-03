import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rootCss = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');
const networkCss = readFileSync('components/AgencyNetworkWorkspace.module.css','utf8');
const networkFinal = networkCss.slice(networkCss.lastIndexOf('Network action controls v5'));

test('labelled controls keep horizontal icon alignment and can wrap full labels', () => {
  const final = rootCss.slice(rootCss.lastIndexOf('Authenticated mobile control system v1'));
  assert.match(final, /flex-direction: row !important/);
  assert.match(final, /white-space: normal !important/);
  assert.match(final, /word-break: normal/);
  assert.match(final, /overflow-wrap: normal/);
});

test('icon-only geometry uses explicit roles rather than ignoring text nodes', () => {
  assert.doesNotMatch(rootCss, /button\[aria-label\]:has\(> svg:only-child\)/);
  assert.match(rootCss, /data-ui-button="icon"[\s\S]*display: grid !important[\s\S]*place-items: center !important/);
});

test('Network Open club action is always horizontal and readable', () => {
  assert.match(networkFinal, /\.clubCard \.secondaryAction[\s\S]*min-width: 96px/);
  assert.match(networkFinal, /font-size: 10px/);
  assert.match(networkFinal, /white-space: nowrap/);
  assert.match(networkFinal, /\.actionsSolo \.secondaryAction[\s\S]*width: 100%/);
  assert.doesNotMatch(networkFinal, /font-size: 0/);
});
