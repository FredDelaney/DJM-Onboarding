import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const relationship = readFileSync(
  'components/AgencyRelationshipActions.module.css',
  'utf8',
);
const launcher = readFileSync(
  'components/AiLauncher.module.css',
  'utf8',
);
const capture = readFileSync(
  'components/AiCapture.module.css',
  'utf8',
);

test('Network create action disappears inside person and club detail', () => {
  assert.match(
    shell,
    /view === 'network'[\s\S]*!selectedNetworkPersonId[\s\S]*!String\(search\.get\('club'\)/,
  );
});

test('relationship quick actions meet the mobile touch and readability baseline', () => {
  assert.match(relationship, /Premium mobile relationship actions v1/);
  assert.match(
    relationship,
    /\.actions button[\s\S]*min-height: 44px[\s\S]*font-size: 10\.5px/,
  );
  assert.match(
    relationship,
    /\.formHead button[\s\S]*width: 44px[\s\S]*height: 44px/,
  );
  assert.match(relationship, /\.save[\s\S]*min-height: 44px/);
});

test('compact Capture sheet keeps its mobile controls readable', () => {
  assert.match(launcher, /Premium mobile Capture sheet v1/);
  assert.match(
    launcher,
    /\.close[\s\S]*width: 44px[\s\S]*height: 44px/,
  );
  assert.match(
    launcher,
    /\.full,[\s\S]*\.fullDisabled[\s\S]*min-height: 44px[\s\S]*font-size: 11px/,
  );
  assert.match(capture, /Premium compact Capture readability v1/);
  assert.match(
    capture,
    /\.compact \.prompt span[\s\S]*font-size: 11px/,
  );
  assert.match(
    capture,
    /\.compact \.secondary[\s\S]*min-height: 44px[\s\S]*font-size: 10\.5px/,
  );
});
