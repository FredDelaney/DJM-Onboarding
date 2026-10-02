import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../components/AgencyOperatingWorkspace.tsx', import.meta.url),
  'utf8',
);

const lazyModules = [
  'AgencyPlayerProfile',
  'AgencyPlayersWorkspace',
  'AgencyOpportunitiesWorkspace',
  'AgencyNetworkWorkspace',
  'AgencyCalendarWorkspace',
  'AgencyPursuitRoom',
  'AgencyNegotiationCommandRoom',
  'AgencyClubAccountDrawer',
];

test('heavy agency workspaces stay out of the initial Home bundle', () => {
  for (const moduleName of lazyModules) {
    assert.match(source, new RegExp(`const ${moduleName} = dynamic\\(`));
    assert.doesNotMatch(source, new RegExp(`import ${moduleName} from`));
  }
});
