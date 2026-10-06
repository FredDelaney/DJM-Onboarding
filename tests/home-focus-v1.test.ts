import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const styles = readFileSync(
  'components/AgencyOperatingWorkspace.module.css',
  'utf8',
);

const homeStart = workspace.indexOf('function Home(');
const homeEnd = workspace.indexOf('function Players(', homeStart);
const home = workspace.slice(homeStart, homeEnd);

test('Home headline reflects the bounded ranked queue', () => {
  assert.match(home, /queue\.length/);
  assert.match(home, /things matter/);
  assert.match(home, /Nothing needs your attention/);
  assert.doesNotMatch(home, /identityResolution/);
});

test('Home shows no more than five ranked items', () => {
  assert.match(home, /\.sort\(\(a, b\) => b\.score - a\.score\)/);
  assert.match(home, /\.slice\(0, 5\)/);
  assert.match(home, /<h2>Today<\/h2>/);
  assert.match(home, /Start with number one/);
  assert.match(home, /Today at a glance/);
  assert.match(home, /queueAction\(item\)/);
  assert.match(home, /Record outcome/);
  assert.doesNotMatch(home, /Resolve identities/);
});

test('Today includes current work plus explicit upcoming risk', () => {
  assert.match(home, /const todayKey = localDayKey\(now\)/);
  assert.match(home, /calendar_kind === 'meeting'/);
  assert.match(home, /calendar_kind === 'deadline'/);
  assert.match(home, /calendar_kind === 'birthday'/);
  assert.match(home, /daysAway >= 0 && daysAway <= 30/);
  assert.match(home, /'Upcoming risk'/);
  assert.match(home, /href=\{\`\$\{basePath\}\?view=calendar\`\}/);
});

test('Connected Work stays evidence underneath Home rather than becoming an activity feed', () => {
  assert.match(home, /connectedWork\?\.upcoming_meetings/);
  assert.doesNotMatch(home, /recentConnected/);
  assert.doesNotMatch(home, /handledStrip/);
  assert.doesNotMatch(home, /connectedWorkRow/);
});

test('Home does not duplicate Players Opportunities or Business dashboards', () => {
  assert.doesNotMatch(home, /AGENCY PULSE/);
  assert.doesNotMatch(home, /homePulse/);
  assert.doesNotMatch(home, /playerService/);
  assert.doesNotMatch(home, /opportunityMoves/);
  assert.doesNotMatch(home, /ownerBusiness/);
  assert.doesNotMatch(home, /href="\?view=players"/);
  assert.doesNotMatch(home, /href="\?view=opportunities"/);
  assert.doesNotMatch(home, /href="\?view=business"/);
});

test('Home stays clean and phone-safe', () => {
  assert.match(styles, /\.homeTodayQueue/);
  assert.match(styles, /\.todayQueueList/);
  assert.match(styles, /\.todayQueueCard/);
  assert.match(
    styles,
    /@media\(max-width:680px\)[\s\S]*\.homeTodayQueue/,
  );
  assert.doesNotMatch(styles, /\.homePulseGrid\s*\{/);
});
