import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ownerLaunch = readFileSync(
  'app/activate/[tenantSlug]/page.tsx',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const workspaceCss = readFileSync(
  'components/AgencyOperatingWorkspace.module.css',
  'utf8',
);

test('first value completion stops talking like setup software', () => {
  assert.match(ownerLaunch, /FIRST VALUE REACHED/);
  assert.match(ownerLaunch, /Your agency is operating now/);
  assert.match(ownerLaunch, /First working value reached/);
  assert.doesNotMatch(ownerLaunch, /Owner setup complete/);
});

test('first value hands the owner directly into live opportunities', () => {
  assert.match(
    ownerLaunch,
    /\/workspace\/\$\{encodeURIComponent\(runtime\.slug\)\}\?view=opportunities&handoff=first-value/,
  );
  assert.match(ownerLaunch, /Enter live opportunities/);
});

test('operating workspace treats the handoff as transient presentation only', () => {
  assert.match(
    workspace,
    /search\.get\('handoff'\) === 'first-value'/,
  );
  assert.match(workspace, /next\.delete\('handoff'\)/);
  assert.match(workspace, /window\.history\.replaceState/);
  assert.doesNotMatch(workspace, /localStorage/);
  assert.doesNotMatch(workspace, /sessionStorage/);
});

test('handoff resolves legacy opportunities into Market and can disappear immediately', () => {
  assert.match(
    workspace,
    /showFirstValueHandoff && view === 'market'/,
  );
  assert.match(
    workspace,
    /rawRequestedView === 'opportunities'/,
  );
  assert.match(workspace, /FIRST WORKING VALUE REACHED/);
  assert.match(workspace, /Continue working/);
  assert.match(
    workspace,
    /onClick=\{\(\) => setShowFirstValueHandoff\(false\)\}/,
  );
});

test('handoff preserves normal evidence-led workspace navigation', () => {
  assert.match(workspace, /Today/);
  assert.match(workspace, /Market/);
  assert.match(workspace, /Deals/);
  assert.match(workspace, /see what\s+matters next/);
  assert.doesNotMatch(workspace, /mark.*first.*value/i);
  assert.doesNotMatch(workspace, /complete.*first.*value/i);
});

test('handoff treatment is responsive and workspace-scoped', () => {
  assert.match(workspaceCss, /\.firstValueHandoff\s*\{/);
  assert.match(
    workspaceCss,
    /grid-template-columns:\s*42px minmax\(0,\s*1fr\) auto/,
  );
  assert.match(
    workspaceCss,
    /@media \(max-width: 680px\)[\s\S]*\.firstValueHandoff/,
  );
});
