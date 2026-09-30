import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const network = readFileSync(
  'components/AgencyNetworkWorkspace.tsx',
  'utf8',
);
const css = readFileSync(
  'components/AgencyNetworkWorkspace.module.css',
  'utf8',
);

test('mobile club cards keep an explicit path into the club account', () => {
  assert.match(network, /aria-label=\{[^}]*clubName/);
  assert.match(network, /title="Open club"/);
  assert.match(css, /Mobile club account access v1/);
  assert.match(
    css,
    /\.clubCard \.secondaryAction[\s\S]*width: 44px[\s\S]*min-height: 44px/,
  );
});

test('club account access stays compact beside the primary next move', () => {
  assert.match(
    css,
    /\.clubCard \.actions[\s\S]*grid-template-columns: 44px minmax\(0, 1fr\)/,
  );
  assert.match(
    css,
    /\.clubCard \.actions:not\(:has\(\.primaryAction\)\)[\s\S]*grid-template-columns: 1fr/,
  );
  assert.match(
    css,
    /\.clubCard \.actions:not\(:has\(\.primaryAction\)\) \.secondaryAction[\s\S]*font-size: 11px/,
  );
});
