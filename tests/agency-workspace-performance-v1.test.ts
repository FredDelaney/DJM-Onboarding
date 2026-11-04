import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../components/AgencyOperatingWorkspace.tsx', import.meta.url),
  'utf8',
);

const lazyModules = [
  'WorkspaceSearch',
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
    /onPointerEnter=\{\(\) => \{ if \(item\.view\) preloadWorkspaceView\(item\.view\); \}\}/,
  );
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /navigateWorkspaceView\(item\.view, item\.href\)/);
  assert.match(source, /navigateWorkspaceView\(item\.view, item\.href\)/);
  assert.match(source, /prefetch=\{false\}/);
});
