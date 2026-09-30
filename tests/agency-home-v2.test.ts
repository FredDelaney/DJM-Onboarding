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
  assert.doesNotMatch(homeLoader, /redream_provider_contact_suggestions/);
  assert.doesNotMatch(homeLoader, /agency_control_centre/);
  assert.match(homeLoader, /commit\(\{ \.\.\.\(latestData \|\| \{\}\), home \}\)/);
  assert.match(homeLoader, /void Promise\.allSettled\(\[/);
});

test('Home uses the existing personal ownership spine rather than inventing another task system', () => {
  assert.match(personalWork, /platform_server_personal_home_commands/);
  assert.match(personalWork, /platform_server_user_task_commands/);
  assert.match(personalWork, /t\.owner_user_id=p_user_id/);
  assert.match(personalWork, /Tasks owned by another user are excluded from this personal Home feed/);
  assert.match(personalWork, /Only commitments owned by the signed-in agency user/);
});

test('Home shows a bounded decision queue with one direct action per item', () => {
  assert.match(home, /priority\.slice\(0, 3\)/);
  assert.match(home, /<h2>Needs you<\/h2>/);
  assert.match(home, /actionFor\(command\)/);
  assert.match(home, /onPrepare\(command\)/);
  assert.match(home, /onOpenAction\(command\)/);
  assert.match(home, /Record outcome/);
  assert.doesNotMatch(home, /Resolve identities/);
  assert.doesNotMatch(home, /priority_score\}/);
});

test('Home uses real current-day evidence for the Today view', () => {
  assert.match(home, /operations\?\.deadlines\?\.items/);
  assert.match(home, /important_dates\?\.birthdays\?\.items/);
  assert.match(home, /connectedWork\?\.upcoming_meetings/);
  assert.match(home, /localDayKey\(item\?\.deadline_at\) === todayKey/);
  assert.match(home, /href="\?view=calendar"/);
});

test('Home is not a duplicate agency dashboard', () => {
  assert.doesNotMatch(home, /AGENCY PULSE/);
  assert.doesNotMatch(home, /dealData/);
  assert.doesNotMatch(home, /marketNeeds/);
  assert.doesNotMatch(home, /playerAttention/);
  assert.doesNotMatch(home, /ownerBusiness/);
  assert.doesNotMatch(home, /Metric\s*\(/);
});

test('handled automation is compact and responsive', () => {
  assert.match(home, /REDREAM HANDLED/);
  assert.match(home, /styles\.handledStrip/);
  assert.match(css, /\.handledStrip\s*\{/);
  assert.match(
    css,
    /@media \(max-width: 680px\)[\s\S]*\.handledStrip/,
  );
  assert.doesNotMatch(css, /\.homePulseGrid\s*\{/);
});
