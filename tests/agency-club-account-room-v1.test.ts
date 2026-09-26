import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const club = fs.readFileSync(
  'components/AgencyClubAccountDrawer.tsx',
  'utf8',
);

test('Network opens a tenant-native Club workspace without adding another daily workspace', () => {
  assert.match(
    workspace,
    /AgencyClubAccountDrawer/,
  );

  assert.match(
    workspace,
    /Open club/,
  );

  assert.doesNotMatch(
    workspace,
    /key: 'club-account'/,
  );
});

test('Club reuses the existing combined tenant-native club account contract', () => {
  assert.match(
    club,
    /invoke\(\s*'club_account'/,
  );

  assert.match(
    club,
    /organisation_id/,
  );

  assert.match(
    club,
    /network_coverage/,
  );

  assert.match(
    club,
    /strategic_plays/,
  );

  assert.match(
    club,
    /relationship_activity/,
  );

  assert.match(
    club,
    /open_work/,
  );
});

test('Club keeps direct relationships and warm introduction evidence distinct', () => {
  assert.match(
    club,
    /directRoutes/,
  );

  assert.match(
    club,
    /introRoutes/,
  );

  assert.match(
    club,
    /bestRoute/,
  );

  assert.match(
    club,
    /bestIntro/,
  );

  assert.match(
    club,
    /WARM ROUTE/,
  );

  assert.match(
    club,
    /does not guess private club intent or whether a transfer will happen/,
  );
});

test('Club connects relationship context directly to opportunities and deals', () => {
  assert.match(
    club,
    /LIVE OPPORTUNITIES/,
  );

  assert.match(
    club,
    /onOpenDeal/,
  );

  assert.match(
    club,
    /onOpenMarket/,
  );

  assert.match(
    club,
    /Work need/,
  );
});

test('Strategic club plays remain guarded internal preparations rather than external sending', () => {
  assert.match(
    club,
    /play_prepare/,
  );

  assert.match(
    club,
    /Nothing is sent externally without a person confirming it/,
  );

  assert.match(
    workspace,
    /onOpenClubAccount/,
  );
});

test('Club keeps money item-specific and stays tenant-neutral', () => {
  assert.match(
    club,
    /Intl\.NumberFormat/,
  );

  assert.match(
    club,
    /currency/,
  );

  assert.doesNotMatch(
    club,
    /\bDJM\b/,
  );

  assert.doesNotMatch(
    club,
    /\/admin\//,
  );
});
