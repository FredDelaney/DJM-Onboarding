import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const network = readFileSync(
  'components/AgencyNetworkWorkspace.tsx',
  'utf8',
);
const networkCss = readFileSync(
  'components/AgencyNetworkWorkspace.module.css',
  'utf8',
);
const opportunities = readFileSync(
  'components/AgencyOpportunitiesWorkspace.tsx',
  'utf8',
);
const opportunitiesCss = readFileSync(
  'components/AgencyOpportunitiesWorkspace.module.css',
  'utf8',
);

test('mobile club cards preserve an explicit accessible route into the club workspace', () => {
  assert.match(network, /aria-label=\{`Open \$\{clubName\}`\}/);
  assert.match(network, /title="Open club"/);
  assert.match(network, /styles\.actionsSolo/);
  assert.match(networkCss, /Mobile club account access v2/);
  assert.match(
    networkCss,
    /\.clubCard \.actions[\s\S]*grid-template-columns: 44px minmax\(0, 1fr\)/,
  );
  assert.match(
    networkCss,
    /\.clubCard \.actionsSolo \.secondaryAction[\s\S]*width: 100%/,
  );
});

test('generic opportunity and network empty states stay white-label and tenant-branded', () => {
  assert.doesNotMatch(
    opportunities,
    /Add a real club need and ReDream can organise/,
  );
  assert.match(
    opportunities,
    /Add a real club need and the player opportunities around it can be organised here\./,
  );
  assert.match(
    opportunitiesCss,
    /color-mix\(in srgb,var\(--agency-accent\) 9%,transparent\)/,
  );
  assert.match(
    networkCss,
    /color-mix\(in srgb,var\(--agency-accent\) 8%,transparent\)/,
  );
  assert.doesNotMatch(
    opportunitiesCss,
    /rgba\(245,233,0,\.08\)/,
  );
  assert.doesNotMatch(
    networkCss,
    /rgba\(245,233,0,\.07\)/,
  );
});
