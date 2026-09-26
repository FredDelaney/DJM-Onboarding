import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const networkPath = new URL(
  '../components/AgencyNetworkWorkspace.tsx',
  import.meta.url,
);

test('Network adds evidence-led focus without adding another product area', async () => {
  const source = await readFile(
    networkPath,
    'utf8',
  );

  assert.match(
    source,
    /WHERE TO FOCUS/,
  );
  assert.match(
    source,
    /NEEDS ATTENTION/,
  );
  assert.match(
    source,
    /WARM ROUTES/,
  );
  assert.match(
    source,
    /STRONG ROUTES/,
  );
  assert.match(
    source,
    /GOING QUIET/,
  );

  assert.match(
    source,
    /type NetworkView = 'clubs' \| 'people'/,
  );
});

test('Network intelligence stays deterministic and evidence based', async () => {
  const source = await readFile(
    networkPath,
    'utf8',
  );

  assert.match(
    source,
    /deals_needing_action/,
  );
  assert.match(
    source,
    /confirmed_needs/,
  );
  assert.match(
    source,
    /direct_score/,
  );
  assert.match(
    source,
    /introduction_score/,
  );
  assert.match(
    source,
    /last_interaction_at/,
  );
  assert.match(
    source,
    /age > 45/,
  );

  assert.match(
    source,
    /not predictions of influence, response or deal success/,
  );
});

test('Network shows who owns the strongest recorded direct route', async () => {
  const source = await readFile(
    networkPath,
    'utf8',
  );

  assert.match(
    source,
    /routeOwner/,
  );
  assert.match(
    source,
    /owner_name/,
  );
  assert.match(
    source,
    /routeDisplay/,
  );
  assert.match(
    source,
    /→/,
  );
});

test('Network intelligence reuses existing actions and does not query database tables', async () => {
  const source = await readFile(
    networkPath,
    'utf8',
  );

  assert.match(
    source,
    /onOpenClubAccount/,
  );
  assert.match(
    source,
    /setSelectedContact/,
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
  assert.doesNotMatch(
    source,
    /rpc\(/,
  );
});
