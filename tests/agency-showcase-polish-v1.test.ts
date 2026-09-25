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

test('showcase polish presents the V2 agency operating model', () => {
  assert.match(workspace, /label: 'Home'/);
  assert.match(workspace, /label: 'Players'/);
  assert.match(workspace, /label: 'Opportunities'/);
  assert.match(workspace, /label: 'Network'/);
  assert.match(workspace, /label: 'Calendar'/);
  assert.match(workspace, /label: 'Business'/);
  assert.doesNotMatch(workspace, /label: 'Relationships'/);
  assert.doesNotMatch(workspace, /label: 'Market'/);
  assert.doesNotMatch(workspace, /label: 'Deals'/);
  assert.match(workspace, /VIEW_PRESENTATION/);
  assert.doesNotMatch(workspace, /label: 'Brain'/);
});

test('Home keeps attention bounded and every visible item actionable', () => {
  assert.match(workspace, /\.slice\(0, 5\)/);
  assert.match(workspace, /Good morning\./);
  assert.match(workspace, /const actionFor = \(command: any\)/);
  assert.match(workspace, /onClick=\{\(\) => onPrepare\(command\)\}/);
  assert.match(
    workspace,
    /command\?\.actionability\?\.evidence_gate === 'ready'/,
  );
  assert.match(css, /\.attentionCard\s*\{/);
});

test('showcase polish does not bypass guarded agency action execution', () => {
  assert.match(workspace, /action_prepare/);
  assert.match(workspace, /action_execute/);
  assert.match(workspace, /Nothing changes until you confirm/);
  assert.doesNotMatch(workspace, /set_customer_service_state/);
  assert.doesNotMatch(workspace, /set_contract_term/);
});

test('players and relationships use tenant-neutral premium entity presentation', () => {
  assert.match(workspace, /Know what every player needs next\./);
  assert.match(workspace, /Your football network\./);
  assert.match(workspace, /className=\{styles\.entityMark\}/);
  assert.match(workspace, /initials\(playerName\)/);
  assert.match(workspace, /initials\(clubName\)/);
  assert.match(workspace, /Warm introduction/);
  assert.match(workspace, /redream_autopilot_relationships/);
  assert.match(
    workspace,
    /active_players \?\? items\.length\} players/,
  );
  assert.doesNotMatch(
    workspace,
    /active_players \?\? items\.length\} represented/,
  );
  assert.doesNotMatch(workspace, /DJM Sports Management/);
  assert.doesNotMatch(workspace, /ReDream/);
});

test('Market and Deals separate demand creation from commercial execution without inventing probability', () => {
  assert.match(workspace, /Club needs\. Player fits\. Best route in\./);
  assert.match(
    workspace,
    /which players could fit and who can open the door/,
  );
  assert.doesNotMatch(
    workspace,
    /career-approved market opportunities/,
  );
  assert.match(workspace, /Keep every live deal moving\./);
  assert.match(workspace, /className=\{styles\.opportunityColumns\}/);
  assert.match(workspace, /What clubs are looking for/);
  assert.match(workspace, /Routes to move/);
  assert.match(workspace, /Live deals/);
  assert.match(workspace, /candidate_coverage\?\.candidates/);
  assert.match(workspace, /redream_autopilot_market/);
  assert.match(workspace, /redream_autopilot_deals/);
  assert.doesNotMatch(workspace, /candidate\.overall_score/);
  assert.doesNotMatch(workspace, /candidate\.readiness_score/);
});

test('every primary operating area has an intentional empty state', () => {
  assert.match(workspace, /You are clear for now/);
  assert.match(workspace, /No players recorded yet/);
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
