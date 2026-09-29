import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const playerReview = readFileSync(
  'components/AgencyPlayerServiceReviewDrawer.tsx',
  'utf8',
);
const playerReviewCss = readFileSync(
  'components/AgencyPlayerServiceReviewDrawer.module.css',
  'utf8',
);
const closeout = readFileSync(
  'components/AgencyDealCloseoutDrawer.tsx',
  'utf8',
);
const closeoutCss = readFileSync(
  'components/AgencyDealCloseoutDrawer.module.css',
  'utf8',
);
const memory = readFileSync(
  'components/AgencyMemoryDrawer.tsx',
  'utf8',
);
const memoryCss = readFileSync(
  'components/AgencyMemoryDrawer.module.css',
  'utf8',
);

test('substantial review closeout and memory workspaces open page first', () => {
  assert.match(
    workspace,
    /<AgencyPlayerServiceReviewDrawer[\s\S]*presentation="page"/,
  );
  assert.match(
    workspace,
    /<AgencyDealCloseoutDrawer[\s\S]*presentation="page"/,
  );
  assert.match(
    workspace,
    /<AgencyMemoryDrawer[\s\S]*presentation="page"/,
  );
});

test('heavy workspaces remove modal behaviour in page presentation', () => {
  for (const source of [playerReview, closeout, memory]) {
    assert.match(source, /presentation\?: 'drawer' \| 'page'/);
    assert.match(source, /const pageMode = presentation === 'page'/);
    assert.match(source, /role=\{pageMode \? 'region' : 'dialog'\}/);
    assert.match(source, /aria-modal=\{pageMode \? undefined : true\}/);
    assert.match(source, /if \(pageMode\) return/);
    assert.match(source, /pageMode \? styles\.pageShell : styles\.backdrop/);
    assert.match(source, /pageMode \? <ArrowLeft/);
  }
});

test('heavy page workspaces use full-width focused presentation on desktop and mobile', () => {
  for (const css of [playerReviewCss, closeoutCss, memoryCss]) {
    assert.match(css, /\.pageShell\s*\{[\s\S]*position: fixed[\s\S]*inset: 0/);
    assert.match(css, /\.pagePanel\s*\{[\s\S]*max-width: 1160px/);
    assert.match(css, /overflow-y: auto/);
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*safe-area-inset-top/);
    assert.match(css, /safe-area-inset-bottom/);
  }
});

test('short actions remain dialogs rather than becoming full workspaces', () => {
  for (const path of [
    'components/AgencyCreateDrawer.tsx',
    'components/AgencyConnectedReplyDrawer.tsx',
    'components/AgencyMeetingOutcomeDrawer.tsx',
    'components/AgencyTeamHandoffDrawer.tsx',
  ]) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.doesNotMatch(source, /presentation\?: 'drawer' \| 'page'/);
  }
});
