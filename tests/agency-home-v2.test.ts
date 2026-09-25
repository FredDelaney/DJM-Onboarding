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

const homeLoaderStart = workspace.indexOf(
  "if (view === 'home')",
);
const homeLoaderEnd = workspace.indexOf(
  "} else if (view === 'players')",
  homeLoaderStart,
);
const homeLoader = workspace.slice(
  homeLoaderStart,
  homeLoaderEnd,
);

const homeStart = workspace.indexOf(
  'function Home(',
);
const homeEnd = workspace.indexOf(
  'function Players(',
  homeStart,
);
const home = workspace.slice(homeStart, homeEnd);

test('Home keeps ranked attention as the required core and loads support feeds safely', () => {
  assert.match(
    homeLoader,
    /Promise\.allSettled/,
  );
  assert.match(
    homeLoader,
    /redream_autopilot_home/,
  );
  assert.match(
    homeLoader,
    /redream_autopilot_operations/,
  );
  assert.match(
    homeLoader,
    /redream_autopilot_players/,
  );
  assert.match(
    homeLoader,
    /redream_autopilot_market/,
  );
  assert.match(
    homeLoader,
    /redream_autopilot_deals/,
  );
  assert.match(
    homeLoader,
    /if \(reads\[0\]\.status === 'rejected'\)/,
  );
});

test('Home shows a bounded decision queue with one direct action per item', () => {
  assert.match(home, /\.slice\(0, 5\)/);
  assert.match(home, /What needs your attention/);
  assert.match(home, /actionFor\(command\)/);
  assert.match(home, /onPrepare\(command\)/);
  assert.match(home, /onOpenAction\(command\)/);
  assert.doesNotMatch(home, /priority_score\}/);
});

test('Home uses the real deadline contract for the day view', () => {
  assert.match(
    home,
    /operations\?\.deadlines\?\.items/,
  );
  assert.match(home, /item\?\.deadline_at/);
  assert.match(home, /item\.deadline_state/);
  assert.match(home, /href="\?view=calendar"/);
});

test('Home support sections use real market deal and player models rather than recycling attention cards', () => {
  assert.match(
    home,
    /dealData\?\.portfolio\?\.deals/,
  );
  assert.match(
    home,
    /market\?\.pursuits\?\.items/,
  );
  assert.match(
    home,
    /market\?\.demand\?\.items/,
  );
  assert.match(
    home,
    /playerService\?\.players/,
  );
  assert.match(home, /OPPORTUNITIES MOVING/);
  assert.match(home, /PLAYERS NEEDING ATTENTION/);
  assert.match(
    home,
    /opportunityMoves[\s\S]*\.slice\(0, 3\)/,
  );
  assert.match(
    home,
    /playerAttention[\s\S]*\.slice\(0, 3\)/,
  );
});

test('owner and admin Home gets a quiet business strip from recorded business evidence', () => {
  assert.match(
    home,
    /ownerBusiness\?\.control\?\.executive_summary/,
  );
  assert.match(
    home,
    /receivableSummary\.open_receivables/,
  );
  assert.match(
    home,
    /serviceSummary\.total_breaches/,
  );
  assert.match(
    home,
    /href="\?view=business"/,
  );
  assert.match(css, /\.homeBusinessStrip\s*\{/);
});

test('Home remains responsive and avoids dashboard sprawl', () => {
  assert.match(css, /\.homeOverviewGrid\s*\{/);
  assert.match(css, /\.homeSupportGrid\s*\{/);
  assert.match(
    css,
    /@media \(max-width: 980px\)[\s\S]*\.homeOverviewGrid/,
  );
  assert.doesNotMatch(home, /Metric\s*\(/);
});
