import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(path:string)=>readFileSync(path,'utf8');
const data=JSON.parse(read('data/openfootball-clubs.json'));
const clubs=data.clubs as Array<{id:string;name:string;country:string;aliases:string[]}>;

test('Public-domain global catalogue has stable IDs, countries and useful football aliases',()=>{
  assert.equal(data.meta.licence,'CC0-1.0');
  assert.match(data.meta.source_url,/github.com\/openfootball\/clubs/);
  assert.match(data.meta.source_revision,/^[a-f0-9]{40}$/);
  assert.ok(clubs.length>3000);
  assert.ok(new Set(clubs.map(club=>club.country)).size>=90);
  assert.equal(new Set(clubs.map(club=>club.id)).size,clubs.length);
  assert.ok(clubs.every(club=>/^openfootball:[a-z0-9-]+:[a-z0-9-]+$/.test(club.id)));
  assert.ok(clubs.some(club=>club.name.includes('Manchester United')&&club.country==='England'));
  assert.ok(clubs.some(club=>club.name.includes('Wellington Phoenix')&&club.country==='New Zealand'));
});
test('Club catalogue search is bounded, server-side, source-attributed and never exposes a secret',()=>{
  const route=read('app/api/club-catalogue/route.ts');
  assert.match(route,/query.length < 2/);
  assert.match(route,/Math.min\(50, limit\)/);
  assert.match(route,/sourceRevision/);
  assert.match(route,/sourceUrl/);
  assert.doesNotMatch(route,/API_KEY|SERVICE_ROLE|TOKEN/);
});
test('Clubs reference list and flow are real server-backed actions',()=>{
  const component=read('components/AgencyClubsReference.tsx');
  const network=read('components/AgencyNetworkWorkspace.tsx');
  const workspace=read('components/AgencyOperatingWorkspace.tsx');
  const edge=read('supabase/functions/agency-os/index.ts');
  for(const label of ['Search Club','Manual Entry','Recent Searches','Add Another Club','View Club','Add Club']){
    assert.ok(component.includes(label),label);
  }
  assert.match(component,/invoke\('clubs_directory'/);
  assert.match(component,/invoke\('import_club'/);
  assert.match(workspace,/AgencyClubsReference/);
  assert.match(workspace,/onOpenClubAccount=\{setClubAccountRequest\}/);
  assert.doesNotMatch(network,/AgencyClubsReference/);
  assert.match(workspace,/invoke=\{invoke\}/);
  assert.match(edge,/platform_server_clubs_directory/);
  assert.match(edge,/platform_server_agency_import_club/);
  assert.match(edge,/platform_server_club_reference_people/);
  assert.doesNotMatch(component,/ATHLIVO|mockClubs|fakeClubData/);
});
test('Club creation, directory and contact SQL preserve tenant access and private privileges',()=>{
  const core=read('supabase/migrations/20261101155000_redream_club_directory_and_import.sql');
  const people=read('supabase/migrations/20261101161000_redream_club_details_and_contacts.sql');
  const detail=read('components/AgencyClubReferenceDetail.tsx');
  for(const sql of [core,people]){
    assert.match(sql,/SECURITY DEFINER/);
    assert.match(sql,/SET search_path TO ''/);
    assert.match(sql,/REVOKE ALL ON FUNCTION/);
    assert.match(sql,/TO service_role/);
    assert.match(sql,/tenant_memberships|platform_server_assert_agency_operator/);
  }
  assert.match(core,/PRIMARY KEY \(tenant_id, source, source_id\)/);
  assert.match(core,/ENABLE ROW LEVEL SECURITY/);
  assert.match(people,/p\.tenant_id=p_tenant_id/);
  assert.match(people,/private\.user_is_tenant_admin/);
  assert.match(people,/contact_email_invalid/);
  assert.match(detail,/Requests/);
  assert.match(detail,/Deals/);
  assert.match(detail,/Contacts/);
  assert.doesNotMatch(detail,/Select specific people who can view this contact/);
});
test('Previously deployed dashboard scoped activity function is versioned, not silently overwritten',()=>{
  const shared=read('supabase/functions/_shared/agency-dashboard-snapshot.ts');
  const reconciliation=read('supabase/migrations/20261101143000_reconcile_dashboard_and_connected_activity.sql');
  assert.match(shared,/platform_server_dashboard_recent_activity/);
  assert.doesNotMatch(shared,/client\.schema\('platform'\)\.from\('audit_events'\)/);
  assert.match(reconciliation,/platform_server_dashboard_recent_activity/);
  assert.match(reconciliation,/platform_server_player_connected_activity/);
});
