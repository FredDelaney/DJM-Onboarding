import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../components/AgencyOperatingWorkspace.tsx', import.meta.url),
  'utf8',
);

const lazyModules = [
  'AgencyPlayerProfile',
  'AgencyPursuitRoom',
  'AgencyNegotiationCommandRoom',
  'AgencyClubAccountDrawer',
  'AgencyContactIntelligenceDrawer',
  'AgencyEntityIntelligenceDrawer',
  'AgencyActionDrawer',
];

test('heavy secondary agency work stays out of the initial Home bundle', () => {
  for (const moduleName of lazyModules) {
    assert.match(source, new RegExp(`const ${moduleName} = dynamic\\(`));
    assert.doesNotMatch(source, new RegExp(`import ${moduleName} from`));
  }
});

test('top-level agency navigation behaves like an in-app workspace switch', () => {
  assert.match(source, /const navigateWorkspaceView = useCallback/);
  assert.match(source, /window\.history\.pushState/);
  assert.match(
    source,
    /onPointerDown=\{\(\) => void warmView\(item\.key\)\}/,
  );
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /prefetch=\{false\}/);
});

test('workspace warming is early and deduplicated', () => {
  assert.match(source, /viewWarmRequests/);
  assert.match(source, /const existingRequest = viewWarmRequests\.get\(cacheKey\)/);
  assert.match(source, /const warming = viewWarmRequests\.get\(cacheKey\)/);
  assert.match(source, /const priorityTargets = targets\.slice\(0, 2\)/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /}, 320\);/);
});
