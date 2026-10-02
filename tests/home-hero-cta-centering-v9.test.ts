import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');

test('Home hero CTA chevron is hard-centred inside its box', () => {
  assert.match(css, /Home hero CTA optical centring v9/);
  assert.match(css, /\.attentionCardPrimary \.compactButton[\s\S]*position: relative/);
  assert.match(css, /\.attentionCardPrimary \.compactButton svg[\s\S]*top: 50%[\s\S]*left: 50%/);
  assert.match(css, /transform: translate\(-50%, -50%\)/);
});
