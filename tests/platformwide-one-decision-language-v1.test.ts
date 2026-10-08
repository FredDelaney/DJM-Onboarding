import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file: string) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('authenticated workspaces use customer language for next decisions', () => {
  const operating = read('components/AgencyOperatingWorkspace.tsx');
  const search = read('components/WorkspaceSearch.tsx');
  const calendar = read('components/AgencyCalendarWorkspace.tsx');
  const intelligence = read('components/AgencyEntityIntelligenceDrawer.tsx');

  assert.match(operating, /Review this player opportunity/);
  assert.match(operating, /No deal issue needs attention/);
  assert.match(search, /Searching your workspace/);
  assert.match(calendar, /important agency dates will appear here/);
  assert.match(intelligence, /recorded agency information/);

  assert.doesNotMatch(operating, /Review the pursuit evidence/);
  assert.doesNotMatch(operating, /recorded deal-control gap/);
  assert.doesNotMatch(search, /Searching recorded data/);
});

test('player data and service screens avoid database language', () => {
  const data = read('components/AgencyPlayerDataPanel.tsx');
  const service = read('components/AgencyPlayerServiceReviewDrawer.tsx');

  assert.match(data, /Reload player data/);
  assert.match(service, /known deadlines/);
  assert.match(service, /previous reviews/);
  assert.doesNotMatch(data, /Reload recorded data/);
  assert.doesNotMatch(service, /persisted proof history/);
});

test('product story describes player opportunities instead of pursuits', () => {
  const story = read('components/ReDreamProductStory.tsx');
  const decisions = read('components/ReDreamDecisionLayer.tsx');

  assert.match(story, /Player Opportunities/);
  assert.match(story, /Opportunity open/);
  assert.match(decisions, /\['Opportunity'/);
  assert.doesNotMatch(story, /Pursuit open/);
});
