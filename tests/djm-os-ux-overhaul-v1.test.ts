import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.html',
  '.json',
  '.md',
  '.mjs',
]);

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  'node_modules',
]);

const USER_FACING_ROOTS = [
  'app',
  'components',
  'lib',
  'public',
  'supabase/functions',
];

const allSourceFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return allSourceFiles(absolute);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [absolute] : [];
  });

const userFacingSourceFiles = () =>
  USER_FACING_ROOTS.flatMap((relative) => {
    const absolute = path.join(root, relative);
    return fs.existsSync(absolute) ? allSourceFiles(absolute) : [];
  });

test('staff navigation exposes four operational workspaces only', () => {
  const source = read('components/DjmWorkspaceHeader.tsx');
  for (const label of ['Home', 'Players', 'Opportunities', 'Network']) {
    assert.match(source, new RegExp(`label: '${label}'`));
  }
  for (const oldLabel of ["label: 'Brain'", "label: 'Market'", "label: 'Club Contacts'", "label: 'Command'"]) {
    assert.doesNotMatch(source, new RegExp(oldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('mobile staff navigation and full-bleed heroes stay inside the viewport', () => {
  const responsive = read('app/responsive-polish.css');
  const overhaul = read('app/djm-os-ux-overhaul.css');
  assert.match(responsive, /@media \(max-width: 960px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(responsive, /@media \(max-width: 960px\)[\s\S]*grid-column: 1 \/ -1;[\s\S]*overflow-x: auto;/);
  assert.match(responsive, /\.djm-os-product-nav,[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/);
  assert.match(responsive, /@media \(max-width: 420px\)[\s\S]*padding: 9px 6px;/);
  assert.match(overhaul, /\.ux-settings-hero \{ margin-left: -10px; margin-right: -10px;/);
});

test('player navigation is Home, DJM and Me while legacy destinations stay contextual', () => {
  const source = read('components/PlayerShell.tsx');
  assert.match(source, /label: 'Home'/);
  assert.match(source, /label: 'DJM'/);
  assert.match(source, /label: 'Me'/);
  assert.match(source, /activePrefixes: \['\/profile', '\/career', '\/check-in', '\/cv', '\/documents'\]/);
  assert.doesNotMatch(source, /label: 'Career'/);
  assert.doesNotMatch(source, /label: 'Documents'/);
});

test('player Home has one dominant action and no second career navigation system', () => {
  const source = read('app/home/page.tsx');
  assert.match(source, /ux-player-primary-action/);
  assert.doesNotMatch(source, /PlayerCareerNavigator/);
  assert.match(source, /THIS WEEK/);
  assert.match(source, /FROM DJM/);
  assert.match(source, /MY PROFILE/);
});

test('routine player maintenance is one-click and not a CSV or JSON upload workflow', () => {
  const admin = read('app/admin/page.tsx');
  assert.match(admin, /Update all/);
  assert.match(admin, /refresh-player-data-universal/);
  assert.match(admin, /refresh-player-peer-data/);
  assert.match(admin, /if \(!isAdmin \|\| batchBusy\) return/);
  assert.doesNotMatch(admin, /type="file"/);
  assert.doesNotMatch(admin, /accept=.*csv/i);
  assert.doesNotMatch(admin, /JSON\.parse/);
});

test('comparison room keeps four distinct evidence questions', () => {
  const source = read('components/PlayerComparisonExplorer.tsx');
  for (const label of ['Position profile', 'League peers', 'Other leagues', 'Development']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Current level comes from V5/);
  assert.match(source, /synthetic players/i);
  assert.match(source, /does not translate that into a fake target-league percentile/i);
});

test('cross-league comparison uses actual current provider metrics and real target peers', () => {
  const source = read('components/PlayerComparisonExplorer.tsx');
  assert.match(source, /current_window \|\| provider\?\.metrics\?\.current_season/);
  assert.match(source, /competition_id: leagueCompare/);
  assert.match(source, /__djm_current_player__/);
  assert.match(source, /targetVisiblePeers/);
  assert.doesNotMatch(source, /translatedPercentile|syntheticPercentile/);
});

test('comparison SQL is a read composer and does not redefine Player Score V5', () => {
  const sql = read('supabase/migrations/20260830194500_djm_os_ux_comparison_v1.sql');
  assert.match(sql, /djm_player_comparison\(\s*p_player_id uuid,\s*p_compare_competition_id uuid default null/);
  assert.match(sql, /if not djm_os\.is_team_member\(\)/);
  assert.match(sql, /public\.staff_player_access/);
  assert.match(sql, /pr\.role = 'admin'/);
  assert.match(sql, /auth\.role\(\) <> 'service_role'/);
  assert.match(sql, /djm_os\.player_scorecards/);
  assert.match(sql, /if not exists\(select 1 from public\.players p where p\.id = p_player_id\)/);
  assert.doesNotMatch(sql, /exists\(select 1 from player_row\)/);
  assert.doesNotMatch(sql, /create function public\.djm_player_scorecard/i);
  assert.doesNotMatch(sql, /create or replace function public\.djm_player_scorecard/i);
});

test('audit read fix preserves RLS rather than weakening security', () => {
  const sql = read('supabase/migrations/20260830194500_djm_os_ux_comparison_v1.sql');
  assert.match(sql, /grant select on table public\.audit_events to authenticated/);
  assert.doesNotMatch(sql, /disable row level security/i);
  assert.doesNotMatch(sql, /grant all on table public\.audit_events/i);
});

test('peer refresh caches observed PitchAPI cohorts only with a minimum sample', () => {
  const source = read('supabase/functions/refresh-player-peer-data/index.ts');
  assert.match(source, /profile\?\.role !== "admin"/);
  assert.match(source, /row\.minutes >= 180/);
  assert.match(source, /aggregated\.length < 6/);
  assert.match(source, /PitchAPI returned \$\{aggregated\.length\} players/);
  assert.match(source, /matches_with_advanced_stats: matchesWithAdvancedStats/);
  assert.match(source, /synthetic_players: false/);
  assert.match(source, /provider: "pitchapi"/);
  assert.match(source, /clean\(error\?\.message\)/);
  assert.doesNotMatch(source, /Math\.random/);
});

test('comparison discovery surfaces provider failures instead of silently emptying the catalogue', () => {
  const source = read('components/PlayerComparisonExplorer.tsx');
  assert.match(source, /catch\(\(catalogError\) =>/);
  assert.match(source, /setError\(friendlyError\(catalogError\)\)/);
});

test('peer refresh supports verified target competitions without guessing an identity', () => {
  const source = read('supabase/functions/refresh-player-peer-data/index.ts');
  const bridge = read('supabase/migrations/20260830212500_djm_peer_refresh_service_bridge_v1.sql');
  assert.match(source, /competition_id/);
  assert.match(bridge, /provider_ids ->> 'pitchapi'/);
  assert.match(source, /This competition does not yet have a verified PitchAPI identity in DJM/);
  assert.match(source, /resolveCompetitionFromDjm/);
});

test('peer refresh keeps the private schema outside PostgREST and uses service-only bridge RPCs', () => {
  const source = read('supabase/functions/refresh-player-peer-data/index.ts');
  const sql = read('supabase/migrations/20260830212500_djm_peer_refresh_service_bridge_v1.sql');
  assert.doesNotMatch(source, /\.schema\("djm_os"\)/);
  assert.match(source, /admin\.rpc\("djm_peer_refresh_context"/);
  assert.match(source, /admin\.rpc\("djm_replace_provider_peer_cache"/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.djm_peer_refresh_context[\s\S]*from authenticated/);
  assert.match(sql, /grant execute on function public\.djm_peer_refresh_context[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to authenticated/);
});

test('other-league discovery can bootstrap from the live provider catalogue without pre-seeded DJM leagues', () => {
  const explorer = read('components/PlayerComparisonExplorer.tsx');
  const refresh = read('supabase/functions/refresh-player-peer-data/index.ts');
  const sql = read('supabase/migrations/20260830194500_djm_os_ux_comparison_v1.sql');
  const bridge = read('supabase/migrations/20260830212500_djm_peer_refresh_service_bridge_v1.sql');
  assert.match(explorer, /mode: 'catalog'/);
  assert.match(explorer, /PitchAPI catalogue/);
  assert.match(explorer, /provider_competition_id: selectedCatalogLeague\.id/);
  assert.match(refresh, /mode === "catalog"/);
  assert.match(refresh, /resolveCompetitionFromProvider/);
  assert.match(bridge, /c\.provider_ids ->> 'pitchapi' = p_provider_competition_id/);
  assert.match(sql, /'competitions'/);
});

test('legacy top-level products redirect into the simplified information architecture', () => {
  assert.match(read('app/(djm-os)/market/page.tsx'), /redirect\('\/opportunities'\)/);
  assert.match(read('app/(djm-os)/deals/page.tsx'), /redirect\('\/opportunities'\)/);
  assert.match(read('app/(djm-os)/recruitment/page.tsx'), /redirect\('\/admin'\)/);
  assert.match(read('app/(djm-os)/brain/page.tsx'), /redirect\('\/settings'\)/);
});

test('global intelligence protects the V9 evidence and audit contract', () => {
  const source = read('components/PlayerIntelligencePanel.tsx');
  assert.match(source, /Missing evidence is treated as uncertainty, never as zero performance/);
  assert.match(source, /Analyst diagnostics/);
  assert.match(source, /Legacy V5/);
  assert.match(source, /Audit-only preview · never canonical/);
  assert.match(source, /djm_player_global_intelligence/);
  assert.doesNotMatch(source, /manual_score/);
  assert.doesNotMatch(source, /manual_potential_score/);
});

test('simplification preserves player-service operations and moves admin utilities to settings', () => {
  const home = read('app/(djm-os)/djm/page.tsx');
  assert.match(home, /buildAdminPortfolio/);
  assert.match(home, /portfolio\.issues/);
  assert.match(read('app/(djm-os)/settings/team/page.tsx'), /staff_player_access/);
  assert.match(read('app/(djm-os)/settings/player-experience/page.tsx'), /AdminResourceStudio/);
  assert.match(read('app/(djm-os)/settings/player-experience/page.tsx'), /announcements/);
});

test('opportunity matching consumes the real current candidate RPC shape', () => {
  const source = read('app/(djm-os)/opportunities/page.tsx');
  assert.match(source, /djm_market_candidates_v2/);
  assert.match(source, /row\.player_position \|\| row\.primary_position/);
  assert.match(source, /overall_score \?\? row\.match_score/);
  assert.match(source, /djm_opportunity_upsert/);
});

test('release source contains no hard reload, synthetic randomness or em dash', () => {
  const files = userFacingSourceFiles();
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /window\.location\.reload\s*\(/, path.relative(root, file));
    assert.doesNotMatch(source, /Math\.random\s*\(/, path.relative(root, file));
    assert.equal(source.includes('\u2014'), false, `em dash in ${path.relative(root, file)}`);
  }
});
