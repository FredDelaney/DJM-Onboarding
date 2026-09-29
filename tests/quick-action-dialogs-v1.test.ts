import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const quickActions = [
  ['Create', 'components/AgencyCreateDrawer.module.css'],
  ['Action', 'components/AgencyActionDrawer.module.css'],
  ['Reply', 'components/AgencyConnectedReplyDrawer.module.css'],
  ['Meeting outcome', 'components/AgencyMeetingOutcomeDrawer.module.css'],
  ['Team handoff', 'components/AgencyTeamHandoffDrawer.module.css'],
] as const;

const workspace = read('components/AgencyOperatingWorkspace.tsx');

test('substantial agency work stays page first', () => {
  assert.match(workspace, /<AgencyPlayerServiceReviewDrawer[\s\S]*presentation="page"/);
  assert.match(workspace, /<AgencyDealCloseoutDrawer[\s\S]*presentation="page"/);
  assert.match(workspace, /<AgencyMemoryDrawer[\s\S]*presentation="page"/);
  assert.match(workspace, /<AgencyPursuitRoom[\s\S]*presentation="page"/);
  assert.match(workspace, /<AgencyNegotiationCommandRoom[\s\S]*presentation="page"/);
});

test('bounded quick actions are centred contained dialogs on desktop', () => {
  for (const [name, path] of quickActions) {
    const css = read(path);
    assert.match(css, /Quick action dialog v1/, `${name} should use the shared quick-action geometry rule`);
    assert.match(css, /@media \(min-width: 681px\)/, `${name} should define desktop dialog geometry`);
    assert.match(css, /padding: 24px/, `${name} should keep breathing room around the dialog`);
    assert.match(css, /border-radius: 20px/, `${name} should be visibly contained rather than edge-attached`);
    assert.match(css, /(max-height|height): min\((86|88)dvh,/, `${name} should stay within the viewport`);
  }
});

test('create and action flows stop inheriting full-height side-panel geometry', () => {
  for (const path of [
    'components/AgencyCreateDrawer.module.css',
    'components/AgencyActionDrawer.module.css',
  ]) {
    const css = read(path);
    const desktop = css.slice(css.indexOf('Quick action dialog v1'));
    assert.match(desktop, /min-height: 0/);
    assert.match(desktop, /justify-content: center/);
  }
});

test('quick actions become deliberate bottom sheets on mobile', () => {
  const create = read('components/AgencyCreateDrawer.module.css');
  const action = read('components/AgencyActionDrawer.module.css');
  const reply = read('components/AgencyConnectedReplyDrawer.module.css');
  const meeting = read('components/AgencyMeetingOutcomeDrawer.module.css');
  const handoff = read('components/AgencyTeamHandoffDrawer.module.css');

  for (const css of [create, action, reply, meeting, handoff]) {
    assert.match(css, /@media \(max-width: (620|680)px\)/);
    assert.match(css, /border-radius: 19px 19px 0 0/);
  }

  assert.match(create.slice(create.indexOf('Quick action dialog v1')), /align-items: flex-end/);
  assert.match(action.slice(action.indexOf('Quick action dialog v1')), /align-items: flex-end/);
  assert.match(reply, /align-items: end/);
  assert.match(meeting, /align-items: end/);
  assert.match(handoff, /align-items: end/);
});

test('all five quick actions keep true modal semantics', () => {
  for (const path of [
    'components/AgencyCreateDrawer.tsx',
    'components/AgencyActionDrawer.tsx',
    'components/AgencyConnectedReplyDrawer.tsx',
    'components/AgencyMeetingOutcomeDrawer.tsx',
    'components/AgencyTeamHandoffDrawer.tsx',
  ]) {
    const source = read(path);
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
  }
});
