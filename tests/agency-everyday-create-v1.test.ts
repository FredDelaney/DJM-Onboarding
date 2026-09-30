import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const drawer = readFileSync(
  'components/AgencyCreateDrawer.tsx',
  'utf8',
);
const css = readFileSync(
  'components/AgencyCreateDrawer.module.css',
  'utf8',
);
const network = readFileSync(
  'components/AgencyNetworkWorkspace.tsx',
  'utf8',
);
const networkCss = readFileSync(
  'components/AgencyNetworkWorkspace.module.css',
  'utf8',
);
const edge = readFileSync(
  'supabase/functions/agency-os/index.ts',
  'utf8',
);

const migrationName = readdirSync('supabase/migrations')
  .filter((name) =>
    name.endsWith('_add_agency_everyday_create_actions_v1.sql'),
  )
  .sort()
  .at(-1);

assert.ok(
  migrationName,
  'Everyday creation migration was not found',
);

const migration = readFileSync(
  `supabase/migrations/${migrationName}`,
  'utf8',
);

const clubCreateMigration = readFileSync(
  'supabase/migrations/20260930161000_add_agency_network_club_create_v1.sql',
  'utf8',
);

test('every daily data area has one obvious real create action', () => {
  assert.match(workspace, /label: 'Add player'/);
  assert.match(workspace, /kind: 'club_need', label: 'Add opportunity'/);
  assert.doesNotMatch(workspace, /label: 'Add deal'/);
  assert.match(network, /view === 'clubs' \? 'Add club' : 'Add contact'/);
  assert.match(network, /onCreate\(view === 'clubs' \? 'club' : 'contact'\)/);
  assert.match(workspace, /onCreate=\{\(kind\) => setCreateKind\(kind\)\}/);
  assert.match(workspace, /AgencyCreateDrawer/);
  assert.match(workspace, /Import players/);
  assert.doesNotMatch(workspace, /Add \/ import players/);
});

test('one reusable create drawer stays minimum-first and football specific', () => {
  assert.match(drawer, /title: 'Add player'/);
  assert.match(drawer, /title: 'Add club'/);
  assert.match(drawer, /title: 'Add club need'/);
  assert.match(drawer, /title: 'Add deal'/);
  assert.match(drawer, /title: 'Add contact'/);
  assert.match(drawer, /Primary position/);
  assert.match(drawer, /What does the club need\?/);
  assert.match(drawer, /Relationship note/);
  assert.match(drawer, /Expected commission/);
  assert.match(drawer, /Next action/);
  assert.match(drawer, /const \[showDetails, setShowDetails\]/);
  assert.match(drawer, /More details/);
  assert.match(drawer, /styles\.optionalDetails/);
  assert.match(css, /\.detailsToggle/);
  assert.match(css, /\.optionalDetails/);
  assert.match(
    drawer,
    /does not invent a success probability when you create a deal/,
  );
  assert.doesNotMatch(drawer, /win probability/i);
});

test('drawer actions go through the tenant-bound agency operating bridge', () => {
  assert.match(drawer, /invoke\('create_options'\)/);
  assert.match(drawer, /action = 'create_player'/);
  assert.match(drawer, /action = 'create_club'/);
  assert.match(drawer, /action = 'create_club_need'/);
  assert.match(drawer, /action = 'create_contact'/);
  assert.match(drawer, /action = 'create_deal'/);
  assert.match(workspace, /invoke<any>\(action, body\)/);
  assert.match(workspace, /tenant_id: workspace\.tenant_id/);
});

test('agency-os resolves the tenant before calling service-only create writers', () => {
  assert.match(edge, /const tenantId=String\(workspace\.tenant_id\)/);
  assert.match(edge, /if\(action==="create_player"\)/);
  assert.match(edge, /if\(action==="create_club"\)/);
  assert.match(edge, /if\(action==="create_club_need"\)/);
  assert.match(edge, /if\(action==="create_contact"\)/);
  assert.match(edge, /if\(action==="create_deal"\)/);
  assert.match(edge, /if\(!operator\(\)\) return deny\("Agency operator access required"\)/);
  assert.match(edge, /p_tenant_id:tenantId/);
  assert.match(edge, /p_actor_user_id:userId/);
  assert.match(edge, /platform_server_agency_create_player/);
  assert.match(edge, /platform_server_agency_create_club/);
  assert.match(edge, /platform_server_agency_create_club_need/);
  assert.match(edge, /platform_server_agency_create_contact/);
  assert.match(edge, /platform_server_agency_create_deal/);
});

test('server writers are explicit-tenant, service-only and append audit evidence', () => {
  assert.match(migration, /platform_server_assert_agency_operator/);
  assert.match(
    migration,
    /m\.role in \('owner', 'admin', 'agent', 'operations'\)/,
  );
  assert.match(
    migration,
    /platform_server_agency_create_player/,
  );
  assert.match(
    migration,
    /platform_server_agency_create_club_need/,
  );
  assert.match(
    migration,
    /platform_server_agency_create_contact/,
  );
  assert.match(
    migration,
    /platform_server_agency_create_deal/,
  );
  assert.match(migration, /insert into platform\.audit_events/);
  assert.match(migration, /insert into djm_os\.events/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(
    migration,
    /grant execute[\s\S]{0,160}to authenticated/,
  );
});

test('club creation is tenant scoped and does not reuse the legacy global helper', () => {
  assert.match(
    migration,
    /organisations_tenant_club_name_unique/,
  );
  assert.match(
    migration,
    /o\.tenant_id = p_tenant_id[\s\S]*lower\(btrim\(o\.name\)\) = lower\(v_name\)/,
  );
  assert.match(
    migration,
    /canonical_key[\s\S]*null/,
  );
  assert.doesNotMatch(
    migration,
    /djm_os\.ensure_organisation/,
  );
});

test('manual deal creation records no invented outcome probability', () => {
  assert.match(
    migration,
    /alter column probability drop not null/,
  );
  assert.match(
    migration,
    /probability_source[\s\S]*'not_scored'/,
  );
  assert.match(
    migration,
    /'not_scored_on_manual_create'/,
  );
  assert.match(
    migration,
    /No outcome probability was invented for a manually created deal\./,
  );
});

test('create drawer is a real responsive workspace surface', () => {
  assert.match(css, /\.backdrop\s*\{/);
  assert.match(css, /\.drawer\s*\{/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /min-height: 100dvh/);
});


test('Network adds clubs as first-class tenant records without fabricating a contact or need', () => {
  assert.match(clubCreateMigration, /platform_server_agency_create_club/);
  assert.match(
    clubCreateMigration,
    /private\.platform_server_assert_agency_operator/,
  );
  assert.match(
    clubCreateMigration,
    /private\.platform_server_agency_ensure_club/,
  );
  assert.match(
    clubCreateMigration,
    /o\.tenant_id = p_tenant_id[\s\S]*o\.organisation_type = 'club'/,
  );
  assert.match(clubCreateMigration, /'platform\.agency\.club_created'/);
  assert.match(clubCreateMigration, /'platform\.agency\.club_reused'/);
  assert.match(clubCreateMigration, /insert into platform\.audit_events/);
  assert.match(clubCreateMigration, /to service_role/);
  assert.doesNotMatch(
    clubCreateMigration,
    /grant execute[\s\S]{0,160}to authenticated/,
  );
  assert.doesNotMatch(clubCreateMigration, /insert into djm_os\.people/);
  assert.doesNotMatch(clubCreateMigration, /insert into djm_os\.club_needs/);
});

test('Network creation stays contextual and mobile touch safe', () => {
  assert.match(network, /styles\.toolbarTools/);
  assert.match(network, /styles\.addEntityButton/);
  assert.match(networkCss, /Contextual Network creation v1/);
  assert.match(networkCss, /\.addEntityButton/);
  assert.match(
    networkCss,
    /@media \(max-width: 680px\)[\s\S]*\.addEntityButton[\s\S]*min-height: 44px/,
  );
});
