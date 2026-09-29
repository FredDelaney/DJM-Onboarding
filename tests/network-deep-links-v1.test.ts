import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const network = readFileSync(
  'components/AgencyNetworkWorkspace.tsx',
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

test('Network people and clubs are both durable URL destinations', () => {
  assert.match(network, /searchParams\.get\('person'\)/);
  assert.match(network, /searchParams\.get\('club'\)/);
  assert.match(network, /params\.set\('person', id\)/);
  assert.match(network, /params\.set\('club', id\)/);
});

test('person and club identity cannot conflict in one Network URL', () => {
  assert.match(
    network,
    /params\.set\('person', id\);[\s\S]*params\.delete\('club'\)/,
  );
  assert.match(
    network,
    /params\.set\('club', id\);[\s\S]*params\.delete\('person'\)/,
  );
});

test('a club deep link opens the canonical club workspace', () => {
  assert.match(network, /requestedClubId/);
  assert.match(
    network,
    /String\(club\?\.organisation_id \|\| ''\) === requestedClubId/,
  );
  assert.match(network, /onOpenClubAccount\(clubRequestFor\(match\)\)/);
  assert.match(network, /onClick=\{\(\) => openClub\(club\)\}/);
});

test('closing or leaving a URL-backed club clears stale club identity', () => {
  assert.match(shell, /const closeClubAccount = \(\) =>/);
  assert.match(shell, /next\.delete\('club'\)/);
  assert.match(shell, /onClose=\{closeClubAccount\}/);
  assert.match(shell, /onOpenDeal=[\s\S]*closeClubAccount\(\)/);
  assert.match(shell, /onOpenPursuit=[\s\S]*closeClubAccount\(\)/);
});

test('Home routes known people and clubs directly into Network', () => {
  assert.match(home, /item\?\.context\?\.person_id \|\| item\?\.person_id/);
  assert.match(
    home,
    /\?view=network&person=\$\{encodeURIComponent\(personId\)\}/,
  );
  assert.match(home, /item\?\.context\?\.organisation_id \|\| item\?\.organisation_id/);
  assert.match(
    home,
    /\?view=network&club=\$\{encodeURIComponent\(organisationId\)\}/,
  );
});

test('Calendar routes known people and clubs directly into Network', () => {
  assert.match(calendar, /if \(item\.personId\)/);
  assert.match(calendar, /label: 'Open person'/);
  assert.match(
    calendar,
    /\?view=network&person=\$\{encodeURIComponent\(item\.personId\)\}/,
  );
  assert.match(calendar, /if \(item\.organisationId\)/);
  assert.match(calendar, /label: 'Open club'/);
  assert.match(
    calendar,
    /\?view=network&club=\$\{encodeURIComponent\(item\.organisationId\)\}/,
  );
});
