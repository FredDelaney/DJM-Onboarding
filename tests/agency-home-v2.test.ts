import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync('components/AgencyOperatingWorkspace.tsx', 'utf8');
const css = readFileSync('components/AgencyOperatingWorkspace.module.css', 'utf8');
const personalWork = readFileSync(
  'supabase/migrations/20260926094944_redream_user_owned_work_v1.sql',
  'utf8',
);

const homeLoaderStart = workspace.indexOf("if (view === 'home')");
const homeLoaderEnd = workspace.indexOf("} else if (view === 'players')", homeLoaderStart);
const homeLoader = workspace.slice(homeLoaderStart, homeLoaderEnd);
const homeStart = workspace.indexOf('function Home(');
const homeEnd = workspace.indexOf('function Players(', homeStart);
const home = workspace.slice(homeStart, homeEnd);

test('Home loads only the evidence needed for the daily operating screen', () => {
  assert.match(homeLoader, /invoke<any>\('home_focus'/);
  assert.match(homeLoader, /Promise\.allSettled/);
  assert.match(homeLoader, /redream_autopilot_home/);
  assert.match(homeLoader, /redream_autopilot_operations/);
  assert.match(homeLoader, /redream_connected_work/);
  assert.match(homeLoader, /redream_meeting_aftercare/);
  assert.doesNotMatch(homeLoader, /redream_autopilot_players/);
  assert.doesNotMatch(homeLoader, /redream_autopilot_market/);
  assert.doesNotMatch(homeLoader, /redream_autopilot_deals/);
});

test('Home uses the existing personal ownership spine rather than inventing another task system', () => {
  assert.match(personalWork, /platform_server_personal_home_commands/);
  assert.match(personalWork, /platform_server_user_task_commands/);
  assert.match(personalWork, /t\.owner_user_id=p_user_id/);
  assert.match(personalWork, /Only commitments owned by the signed-in agency user/);
});

test('Home is one bounded ranked Today queue rather than a dashboard', () => {
  assert.match(home, /type QueueCategory/);
  assert.match(home, /'Needs action now'/);
  assert.match(home, /'Waiting on someone'/);
  assert.match(home, /'Upcoming risk'/);
  assert.match(home, /'Opportunity detected'/);
  assert.match(home, /FYI/);
  assert.match(home, /\.sort\(\(a, b\) => b\.score - a\.score\)/);
  assert.match(home, /\.slice\(0, 5\)/);
  assert.match(home, /<h2>Today<\/h2>/);
  assert.doesNotMatch(home, /<h2>Needs attention<\/h2>/);
  assert.doesNotMatch(home, /What changed/);
  assert.doesNotMatch(home, /Recently handled by ReDream/);
});

test('Every Today card explains why, recommends the next move, owns it and has one action', () => {
  assert.match(home, /item\.why/);
  assert.match(home, /Next step/);
  assert.match(home, /item\.recommendation/);
  assert.match(home, /Owner: \{item\.owner\}/);
  assert.match(home, /When: \{item\.deadline\}/);
  assert.match(home, /queueAction\(item\)/);
  assert.match(home, /actionFor\(item\.payload\)/);
  assert.match(home, /Record outcome/);
  assert.match(css, /\.todayQueueCard/);
  assert.match(css, /\.todayQueueRecommendation/);
});

test('Home ranks current meetings, deadlines and birthdays from real evidence', () => {
  assert.match(home, /operations\?\.deadlines\?\.items/);
  assert.match(home, /important_dates\?\.birthdays\?\.items/);
  assert.match(home, /connectedWork\?\.upcoming_meetings/);
  assert.match(home, /calendar_kind === 'meeting'/);
  assert.match(home, /calendar_kind === 'deadline'/);
  assert.match(home, /calendar_kind === 'birthday'/);
  assert.match(home, /href=\{\`\$\{basePath\}\?view=calendar\`\}/);
});

test('Home is not a duplicate agency dashboard', () => {
  assert.doesNotMatch(home, /AGENCY PULSE/);
  assert.doesNotMatch(home, /Metric\s*\(/);
  assert.doesNotMatch(home, /homePulseGrid/);
  assert.doesNotMatch(home, /homeOverviewGrid/);
});
