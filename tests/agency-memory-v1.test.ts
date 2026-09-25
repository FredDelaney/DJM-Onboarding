import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const memory = fs.readFileSync(
  'components/AgencyMemoryDrawer.tsx',
  'utf8',
);

test('Agency Memory remains underneath the workspace without becoming primary navigation', () => {
  assert.match(workspace, /AgencyMemoryDrawer/);
  assert.doesNotMatch(workspace, /key: 'memory'/);
  assert.doesNotMatch(workspace, />Agency history</);
});

test('Agency Memory loads on demand from existing Agency OS contracts', () => {
  assert.match(memory, /invoke\('brief'/);
  assert.match(memory, /invoke\('action_history'/);
  assert.match(memory, /invoke\('learning_center'/);
  assert.match(memory, /window_hours: 168/);
});

test('Agency Memory distinguishes agency movement from the signed-in user ledger', () => {
  assert.match(memory, /WHAT CHANGED/);
  assert.match(memory, /YOUR ACTION LEDGER/);
  assert.match(memory, /user-scoped/);
});

test('Persistent undo requires an applied reversible action and explicit confirmation', () => {
  assert.match(memory, /item\.status === 'applied'/);
  assert.match(memory, /item\.undo_supported/);
  assert.match(memory, /invoke\('action_undo'/);
  assert.match(memory, /Nothing is reversed until you[\s\S]*confirm/);
});

test('Learning refuses weak evidence and automatic policy mutation', () => {
  assert.match(
    memory,
    /No decision-grade operating pattern is available yet/,
  );
  assert.match(memory, /prefers no recommendation/);
  assert.match(
    memory,
    /cannot automatically change market strategy,[\s\S]*pitch policy[\s\S]*agency operating policy/,
  );
});
