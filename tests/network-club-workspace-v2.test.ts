import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const clubPath = new URL(
  '../components/AgencyClubAccountDrawer.tsx',
  import.meta.url,
);

test('club opens as a simple football relationship workspace', async () => {
  const source = await readFile(
    clubPath,
    'utf8',
  );

  assert.match(source, /CLUB/);
  assert.match(source, /NEXT MOVE/);
  assert.match(source, /PEOPLE WE KNOW/);
  assert.match(source, /WHAT THEY NEED/);
  assert.match(source, /RECENT CONVERSATIONS/);
  assert.match(source, /FOLLOW THROUGH/);
  assert.match(source, /LIVE OPPORTUNITIES/);

  assert.doesNotMatch(
    source,
    /CLUB ACCOUNT ROOM/,
  );
  assert.doesNotMatch(
    source,
    /ACCOUNT POSITION/,
  );
  assert.doesNotMatch(
    source,
    /ACCESS MAP/,
  );
});

test('club uses existing tenant-native account evidence', async () => {
  const source = await readFile(
    clubPath,
    'utf8',
  );

  assert.match(
    source,
    /club_account/,
  );
  assert.match(
    source,
    /relationship_activity/,
  );
  assert.match(
    source,
    /open_work/,
  );
  assert.match(
    source,
    /strategic_plays/,
  );
  assert.match(
    source,
    /commercial/,
  );
  assert.match(
    source,
    /pursuits/,
  );
});

test('club keeps promises separate from ordinary follow-up', async () => {
  const source = await readFile(
    clubPath,
    'utf8',
  );

  assert.match(
    source,
    /Promises/,
  );
  assert.match(
    source,
    /Follow-up/,
  );
  assert.match(
    source,
    /promiseTaskIds/,
  );
  assert.match(
    source,
    /task_type !==[\s\S]*commitment/,
  );
});

test('club remains action oriented without direct database access', async () => {
  const source = await readFile(
    clubPath,
    'utf8',
  );

  assert.match(
    source,
    /prepareNextMove/,
  );
  assert.match(
    source,
    /onOpenMarket/,
  );
  assert.match(
    source,
    /onOpenDeal/,
  );
  assert.match(
    source,
    /onOpenAction/,
  );

  assert.doesNotMatch(
    source,
    /\.from\(/,
  );
  assert.doesNotMatch(
    source,
    /supabase\./,
  );
});
