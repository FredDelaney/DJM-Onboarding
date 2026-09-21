import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const css = readFileSync(
  'components/AgencyOperatingWorkspace.module.css',
  'utf8',
);

test('showcase polish presents the five-area agency operating model', () => {
  assert.match(workspace, /label: 'Home'/);
  assert.match(workspace, /label: 'Players'/);
  assert.match(workspace, /label: 'Market'/);
  assert.match(workspace, /label: 'Deals'/);
  assert.match(workspace, /label: 'Relationships'/);
  assert.doesNotMatch(workspace, /label: 'Network'/);
  assert.match(workspace, /VIEW_PRESENTATION/);
  assert.doesNotMatch(workspace, /label: 'Brain'/);
});

test('Today has one visually dominant evidence-backed next action', () => {
  assert.match(workspace, /DO THIS FIRST/);
  assert.match(workspace, /topOneTap/);
  assert.match(workspace, /onClick=\{\(\) => onPrepare\(top\)\}/);
  assert.match(
    workspace,
    /top\?\.actionability\?\.evidence_gate === 'ready'/,
  );
  assert.match(css, /\.heroPrimaryAction\s*\{/);
});

test('showcase polish does not bypass guarded agency action execution', () => {
  assert.match(workspace, /action_prepare/);
  assert.match(workspace, /action_execute/);
  assert.match(workspace, /Nothing is applied until you confirm/);
  assert.doesNotMatch(workspace, /set_customer_service_state/);
  assert.doesNotMatch(workspace, /set_contract_term/);
});

test('players and relationships use tenant-neutral premium entity presentation', () => {
  assert.match(workspace, /Protect value\. Move careers\./);
  assert.match(workspace, /Know who can move the conversation\./);
  assert.match(workspace, /className=\{styles\.entityMark\}/);
  assert.match(workspace, /initials\(playerName\)/);
  assert.match(workspace, /initials\(clubName\)/);
  assert.match(workspace, /Warm introduction/);
  assert.match(workspace, /redream_autopilot_clubs/);
  assert.doesNotMatch(workspace, /DJM Sports Management/);
  assert.doesNotMatch(workspace, /ReDream/);
});

test('Market and Deals separate demand creation from commercial execution without inventing probability', () => {
  assert.match(workspace, /Find the route worth moving\./);
  assert.match(workspace, /Move the deal, not the admin\./);
  assert.match(workspace, /className=\{styles\.opportunityColumns\}/);
  assert.match(workspace, /Needs worth acting on/);
  assert.match(workspace, /Pursuits needing judgement/);
  assert.match(workspace, /Commercial pipeline/);
  assert.match(workspace, /candidate_coverage\?\.candidates/);
  assert.match(workspace, /redream_autopilot_market/);
  assert.match(workspace, /redream_autopilot_deals/);
  assert.doesNotMatch(workspace, /candidate\.overall_score/);
  assert.doesNotMatch(workspace, /candidate\.readiness_score/);
});

test('every primary operating area has an intentional empty state', () => {
  assert.match(workspace, /Operating queue is clear/);
  assert.match(workspace, /No represented players yet/);
  assert.match(workspace, /No relevant club relationships yet/);
  assert.match(workspace, /No live deals recorded/);
  assert.match(workspace, /No active club demand/);
  assert.match(css, /\.emptyState\s*\{/);
});

test('showcase styling is premium, branded and responsive', () => {
  assert.match(css, /\.viewIntro\s*\{/);
  assert.match(css, /\.workspaceLive\s*\{/);
  assert.match(css, /\.entityHeader\s*\{/);
  assert.match(css, /\.opportunityColumns\s*\{/);
  assert.match(
    css,
    /@media \(max-width: 1120px\)[\s\S]*\.opportunityColumns/,
  );
  assert.match(
    css,
    /@media \(max-width: 680px\)[\s\S]*\.viewIntro/,
  );
});
