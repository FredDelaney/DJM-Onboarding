import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const network = readFileSync(
  'components/AgencyNetworkWorkspace.module.css',
  'utf8',
);
const shell = readFileSync(
  'components/AgencyOperatingWorkspace.module.css',
  'utf8',
);

test('Network uses the full mobile content width', () => {
  assert.match(network, /Premium relationship scan v1/);
  assert.match(network, /\.toolbar[\s\S]*width: 100%[\s\S]*justify-content: stretch/);
  assert.match(network, /\.tabs,[\s\S]*\.search[\s\S]*max-width: none/);
});

test('Network reads as route, next move, action instead of stacked boxes', () => {
  assert.match(network, /\.primaryFact[\s\S]*background: transparent/);
  assert.match(network, /\.primaryFact span[\s\S]*display: block/);
  assert.match(network, /\.nextMove[\s\S]*border: 0[\s\S]*background: transparent/);
  assert.match(network, /\.nextMove strong[\s\S]*-webkit-line-clamp: 2/);
  assert.match(network, /\.primaryAction[\s\S]*min-height: 44px/);
});

test('Home does not waste mobile space on an empty Today card', () => {
  assert.match(shell, /Premium home density v1/);
  assert.match(shell, /homeDayPanel \.emptyState[\s\S]*min-height: 132px/);
});
