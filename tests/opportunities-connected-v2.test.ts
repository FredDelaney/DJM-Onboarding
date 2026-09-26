import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspacePath = new URL(
  '../components/AgencyOperatingWorkspace.tsx',
  import.meta.url,
);

const cssPath = new URL(
  '../components/AgencyOperatingWorkspace.module.css',
  import.meta.url,
);

const opportunitiesSource = (source: string) => {
  const start = source.indexOf(
    'function Opportunities({',
  );
  const end = source.indexOf(
    'function AgencyCalendar({',
    start,
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  return source.slice(start, end);
};

test('Opportunities is one connected operating surface rather than Market stacked above Deals', async () => {
  const workspace = await readFile(
    workspacePath,
    'utf8',
  );

  const opportunities =
    opportunitiesSource(workspace);

  assert.match(
    opportunities,
    /Every opportunity, from club need to deal\./,
  );

  assert.match(
    opportunities,
    /One opportunity\. One clear next move\./,
  );

  assert.doesNotMatch(
    opportunities,
    /<Market/,
  );

  assert.doesNotMatch(
    opportunities,
    /<Deals/,
  );

  assert.match(
    workspace,
    /function Market\(/,
  );

  assert.match(
    workspace,
    /function Deals\(/,
  );
});

test('Opportunity flow follows recorded need player route pitch follow-up and deal evidence', async () => {
  const workspace = await readFile(
    workspacePath,
    'utf8',
  );

  const opportunities =
    opportunitiesSource(workspace);

  for (const stage of [
    "'Need'",
    "'Player'",
    "'Route'",
    "'Pitch'",
    "'Follow-up'",
    "'Deal'",
  ]) {
    assert.match(
      opportunities,
      new RegExp(stage),
    );
  }

  assert.match(
    opportunities,
    /recordedStages/,
  );

  assert.match(
    opportunities,
    /pitch\?\.share_id/,
  );

  assert.match(
    opportunities,
    /pitch\?\.sent_at/,
  );

  assert.match(
    opportunities,
    /pitch\?\.next_action_at/,
  );

  assert.match(
    opportunities,
    /pitch\?\.deal_room_id/,
  );
});

test('Opportunity chain joins pitch to live deal by exact deal room id', async () => {
  const workspace = await readFile(
    workspacePath,
    'utf8',
  );

  const opportunities =
    opportunitiesSource(workspace);

  assert.match(
    opportunities,
    /const dealById = new Map/,
  );

  assert.match(
    opportunities,
    /dealById\.get\(dealRoomId\)/,
  );

  assert.match(
    opportunities,
    /linkedDealIds/,
  );

  assert.doesNotMatch(
    opportunities,
    /toLowerCase\(\).*club|includes\(.*clubName/,
  );
});

test('Every connected opportunity row has one obvious primary action', async () => {
  const workspace = await readFile(
    workspacePath,
    'utf8',
  );

  const opportunities =
    opportunitiesSource(workspace);

  assert.match(
    opportunities,
    /const actionLabel = hasDeal/,
  );

  assert.match(
    opportunities,
    /'Open deal'/,
  );

  assert.match(
    opportunities,
    /'Set follow-up'/,
  );

  assert.match(
    opportunities,
    /'Finish pitch'/,
  );

  assert.match(
    opportunities,
    /'Review player'/,
  );

  assert.match(
    opportunities,
    /'Open pursuit'/,
  );

  assert.match(
    opportunities,
    /'Start search'/,
  );

  assert.match(
    opportunities,
    /onClick=\{\(\) =>[\s\S]*?actOnRow\(row\)/,
  );
});

test('Opportunities reuses existing guarded surfaces without new browser data access', async () => {
  const workspace = await readFile(
    workspacePath,
    'utf8',
  );

  const opportunities =
    opportunitiesSource(workspace);

  assert.match(
    opportunities,
    /onOpenPursuit/,
  );

  assert.match(
    opportunities,
    /onOpenIntelligence/,
  );

  assert.match(
    opportunities,
    /scouting_mandate_prepare/,
  );

  assert.doesNotMatch(
    opportunities,
    /\.from\(/,
  );

  assert.doesNotMatch(
    opportunities,
    /supabase\./,
  );

  assert.doesNotMatch(
    opportunities,
    /overall_score|readiness_score/,
  );
});

test('Connected opportunity journey has a compact responsive visual treatment', async () => {
  const css = await readFile(
    cssPath,
    'utf8',
  );

  assert.match(
    css,
    /\.opportunityJourney\s*\{/,
  );

  assert.match(
    css,
    /\.opportunityFlow\s*\{/,
  );

  assert.match(
    css,
    /repeat\(6, minmax\(0, 1fr\)\)/,
  );

  assert.match(
    css,
    /\.opportunityJourneyAction\s*\{/,
  );

  assert.match(
    css,
    /@media \(max-width: 760px\)/,
  );
});
