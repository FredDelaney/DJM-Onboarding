import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const opportunities = readFileSync(
  'components/AgencyOpportunitiesWorkspace.tsx',
  'utf8',
);
const shell = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const calendar = readFileSync(
  'components/AgencyCalendarWorkspace.tsx',
  'utf8',
);

const homeStart = shell.indexOf('function Home(');
const homeEnd = shell.indexOf('function Players(', homeStart);
const home = shell.slice(homeStart, homeEnd);

test('Opportunities receives the stable workspace base path', () => {
  assert.match(
    shell,
    /<AgencyOpportunitiesWorkspace[\s\S]*basePath=\{basePath\}/,
  );
  assert.match(opportunities, /basePath: string/);
});

test('Opportunities tab selection is URL backed and responds to deep links', () => {
  assert.match(opportunities, /useSearchParams/);
  assert.match(opportunities, /useRouter/);
  assert.match(
    opportunities,
    /const requestedView = opportunityViewFrom\(searchParams\.get\('tab'\)\)/,
  );
  assert.match(opportunities, /setView\(requestedView\)/);
  assert.match(
    opportunities,
    /\?view=opportunities&tab=\$\{nextView\}/,
  );
  assert.match(opportunities, /selectView\('needs'\)/);
  assert.match(opportunities, /selectView\('routes'\)/);
  assert.match(opportunities, /selectView\('deals'\)/);
});

test('Home routes dated opportunity work into the correct lane', () => {
  assert.match(home, /entityType === 'deal'/);
  assert.match(home, /\?view=opportunities&tab=deals/);
  assert.match(home, /entityType === 'player_match'/);
  assert.match(home, /\?view=opportunities&tab=routes/);
  assert.match(home, /entityType === 'club_need'/);
  assert.match(home, /\?view=opportunities&tab=needs/);
});

test('Calendar routes opportunity dates into the correct lane', () => {
  assert.match(calendar, /item\.entityType === 'deal'/);
  assert.match(calendar, /\?view=opportunities&tab=deals/);
  assert.match(calendar, /item\.entityType === 'player_match'/);
  assert.match(calendar, /\?view=opportunities&tab=routes/);
  assert.match(calendar, /item\.entityType === 'club_need'/);
  assert.match(calendar, /\?view=opportunities&tab=needs/);
  assert.match(calendar, /label: 'Open deal'/);
  assert.match(calendar, /label: 'Open route'/);
  assert.match(calendar, /label: 'Open need'/);
});
